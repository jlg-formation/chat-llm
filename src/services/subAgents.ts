import { PROVIDER_DEFAULTS } from '../types'
import type { ApiFormat, AppConfig, Provider } from '../types'
import { DEFAULT_API_FORMAT, DEFAULT_MODEL } from './llm/providerDefaults'

export const RUN_SUBAGENTS_TOOL = 'run_subagents'
export const SUBAGENT_MAX_TASKS = 5
export const SUBAGENT_TIMEOUT_MS = 120_000

const TOOL_FORMATS: ApiFormat[] = [
  'responses',
  'chat_completions',
  'anthropic_messages',
  'google_interactions',
]
const NON_SUPPORTED_PROVIDERS: Provider[] = ['lmstudio', 'ollama']

export interface SubAgentTask {
  prompt: string
  provider?: Provider
  model?: string
}

export interface RunSubAgentsArgs {
  mode: 'parallel' | 'sequential'
  tasks: SubAgentTask[]
}

export interface SubAgentResult {
  index: number
  provider: Provider
  model: string
  status: 'ok' | 'error'
  content?: string
  error?: string
}

export type SubAgentRunner = (
  config: AppConfig,
  prompt: string,
  signal: AbortSignal,
) => Promise<string>

export function parseRunSubAgentsArgs(args: Record<string, unknown>): RunSubAgentsArgs | string {
  const mode = args.mode ?? 'parallel'
  if (mode !== 'parallel' && mode !== 'sequential') {
    return 'mode invalide (parallel ou sequential attendu).'
  }
  if (!Array.isArray(args.tasks) || args.tasks.length === 0) {
    return 'tasks doit contenir au moins une tâche.'
  }
  if (args.tasks.length > SUBAGENT_MAX_TASKS) {
    return `tasks : maximum ${SUBAGENT_MAX_TASKS} tâches par appel.`
  }

  const tasks: SubAgentTask[] = []
  for (const [i, raw] of args.tasks.entries()) {
    const t = (raw ?? {}) as Record<string, unknown>
    if (typeof t.prompt !== 'string' || t.prompt.trim() === '') {
      return `tâche ${i}: prompt obligatoire.`
    }
    if (
      t.provider !== undefined &&
      !Object.keys(PROVIDER_DEFAULTS).includes(t.provider as string)
    ) {
      return `tâche ${i}: provider inconnu.`
    }
    if (t.model !== undefined && typeof t.model !== 'string') {
      return `tâche ${i}: model doit être une chaîne.`
    }
    tasks.push({
      prompt: t.prompt,
      provider: t.provider as Provider | undefined,
      model: t.model as string | undefined,
    })
  }
  return { mode, tasks }
}

export interface SubAgentTarget {
  provider: Provider
  model: string
  apiFormat: ApiFormat
  baseUrl: string
}

export function resolveSubAgentTarget(
  task: SubAgentTask,
  config: AppConfig,
): SubAgentTarget | string {
  const provider = task.provider ?? config.llm.provider
  if (NON_SUPPORTED_PROVIDERS.includes(provider)) {
    return `provider ${provider} non supporté par les sous-agents.`
  }

  const sameProvider = provider === config.llm.provider
  const model = task.model ?? (sameProvider ? config.llm.model : DEFAULT_MODEL[provider])
  if (!model) return `aucun modèle pour le provider ${provider}.`

  const apiFormat =
    sameProvider && TOOL_FORMATS.includes(config.llm.apiFormat)
      ? config.llm.apiFormat
      : DEFAULT_API_FORMAT[provider]

  return {
    provider,
    model,
    apiFormat,
    baseUrl: sameProvider ? config.llm.baseUrl : PROVIDER_DEFAULTS[provider].baseUrl,
  }
}

// Sous-agent : pas de prompt système, pas de sortie structurée, pas de récursion
export function buildSubAgentConfig(config: AppConfig, target: SubAgentTarget): AppConfig {
  return {
    ...config,
    subAgentsEnabled: false,
    jsonSchema: '',
    llm: {
      ...config.llm,
      provider: target.provider,
      model: target.model,
      baseUrl: target.baseUrl,
      apiFormat: target.apiFormat,
      showThinking: false,
    },
  }
}

export function buildSequentialPrompt(prompt: string, prev?: SubAgentResult): string {
  if (!prev) return prompt
  const previous = prev.status === 'ok' ? (prev.content ?? '') : `échec : ${prev.error ?? ''}`
  return `Résultat précédent (index ${prev.index}) :\n${previous}\n\nTâche :\n${prompt}`
}

function failed(
  index: number,
  task: SubAgentTask,
  config: AppConfig,
  error: string,
): SubAgentResult {
  return {
    index,
    provider: task.provider ?? config.llm.provider,
    model: task.model ?? config.llm.model,
    status: 'error',
    error,
  }
}

async function runTask(
  index: number,
  task: SubAgentTask,
  config: AppConfig,
  run: SubAgentRunner,
  signal: AbortSignal,
  prev?: SubAgentResult,
): Promise<SubAgentResult> {
  const target = resolveSubAgentTarget(task, config)
  if (typeof target === 'string') return failed(index, task, config, target)

  const prompt = prev ? buildSequentialPrompt(task.prompt, prev) : task.prompt
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal.addEventListener('abort', onAbort)
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const content = await Promise.race([
      run(buildSubAgentConfig(config, target), prompt, controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error(`délai dépassé (${SUBAGENT_TIMEOUT_MS / 1000} s)`))
        }, SUBAGENT_TIMEOUT_MS)
      }),
    ])
    return { index, provider: target.provider, model: target.model, status: 'ok', content }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return { ...failed(index, task, config, error), provider: target.provider, model: target.model }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

export async function runSubAgents(
  args: RunSubAgentsArgs,
  config: AppConfig,
  run: SubAgentRunner,
  signal: AbortSignal,
): Promise<SubAgentResult[]> {
  if (args.mode === 'parallel') {
    return Promise.all(args.tasks.map((task, i) => runTask(i, task, config, run, signal)))
  }

  const results: SubAgentResult[] = []
  for (const [i, task] of args.tasks.entries()) {
    const prev = results[i - 1]
    results.push(await runTask(i, task, config, run, signal, prev))
  }
  return results
}

const SUBAGENT_PROVIDERS = ['openai', 'anthropic', 'mistral', 'ovh', 'google']

const DESCRIPTION =
  'Lance de 1 à 5 sous-agents, chacun avec son propre prompt, et renvoie leurs réponses. ' +
  "Utilise mode 'parallel' pour des tâches indépendantes, 'sequential' quand une tâche a besoin du résultat de la précédente. " +
  "Chaque tâche doit contenir un prompt complet ; provider et model sont optionnels (par défaut ceux de l'agent courant)."

const PARAMETERS = {
  type: 'object',
  properties: {
    mode: {
      type: 'string',
      enum: ['parallel', 'sequential'],
      description: 'parallel (défaut) ou sequential',
    },
    tasks: {
      type: 'array',
      minItems: 1,
      maxItems: SUBAGENT_MAX_TASKS,
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Prompt complet du sous-agent' },
          provider: { type: 'string', enum: SUBAGENT_PROVIDERS },
          model: { type: 'string', description: 'Identifiant du modèle' },
        },
        required: ['prompt'],
      },
    },
  },
  required: ['tasks'],
}

// Déclaration run_subagents pour le format courant ; vide si désactivé ou si le format ne correspond pas
export function subAgentTools(config: AppConfig, format: ApiFormat): unknown[] {
  if (!config.subAgentsEnabled || config.llm.apiFormat !== format) return []
  const tool = subAgentToolFor(format)
  return tool ? [tool] : []
}

// Forme de déclaration selon le format ; null si le format ne gère pas les outils
function subAgentToolFor(format: ApiFormat): unknown | null {
  switch (format) {
    case 'responses':
      return {
        type: 'function',
        name: RUN_SUBAGENTS_TOOL,
        description: DESCRIPTION,
        parameters: PARAMETERS,
        strict: false,
      }
    case 'chat_completions':
      return {
        type: 'function',
        function: { name: RUN_SUBAGENTS_TOOL, description: DESCRIPTION, parameters: PARAMETERS },
      }
    case 'anthropic_messages':
      return { name: RUN_SUBAGENTS_TOOL, description: DESCRIPTION, input_schema: PARAMETERS }
    case 'google_interactions':
      return {
        type: 'function',
        name: RUN_SUBAGENTS_TOOL,
        description: DESCRIPTION,
        parameters: PARAMETERS,
      }
    default:
      return null
  }
}
