import type { AppConfig, ReasoningEffort } from '../../types'

// Table codée en dur : /v1/models ne renvoie pas les niveaux d'effort.
const ALL_LEVELS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const NO_NONE: ReasoningEffort[] = ALL_LEVELS.filter((e) => e !== 'none')
const NO_MINIMAL: ReasoningEffort[] = ALL_LEVELS.filter((e) => e !== 'minimal')
const NO_NONE_NO_MINIMAL: ReasoningEffort[] = NO_NONE.filter((e) => e !== 'minimal')
const GPT_5_LEVELS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']

const REASONING_EFFORTS: Record<string, ReasoningEffort[]> = {
  'gpt-5.4': GPT_5_LEVELS,
  'gpt-5.4-mini': GPT_5_LEVELS,
  'gpt-5.4-nano': GPT_5_LEVELS,
  'gpt-5.5': GPT_5_LEVELS,
  'gpt-5.6': GPT_5_LEVELS,
  'gpt-5.6-luna': GPT_5_LEVELS,
  'gpt-5.6-sol': GPT_5_LEVELS,
  'gpt-5.6-terra': GPT_5_LEVELS,
  'gpt-6-luna': NO_MINIMAL,
  'gpt-6-sol': NO_MINIMAL,
  'gpt-6-astra': NO_NONE_NO_MINIMAL,
  'gpt-6.1-sol': NO_NONE_NO_MINIMAL,
  'gpt-6.1-terra': NO_MINIMAL,
  'gpt-6.2-astra': NO_NONE,
  'gpt-6.2-sol': NO_NONE_NO_MINIMAL,
}

/** Niveaux d'effort supportés, ou null si le modèle n'est pas dans la table. */
export function getReasoningEfforts(model: string): ReasoningEffort[] | null {
  return REASONING_EFFORTS[model] ?? null
}

/**
 * Effort effectif envoyé à l'API, ou undefined si le champ `reasoning.effort` ne doit pas être envoyé.
 * Sans choix utilisateur (null) : `medium` si supporté, sinon défaut API.
 */
export function resolveReasoningEffort(config: AppConfig): ReasoningEffort | undefined {
  if (config.llm.apiFormat !== 'responses') return undefined
  const levels = getReasoningEfforts(config.llm.model)
  if (!levels) return undefined
  const choice = config.llm.reasoningEffort
  if (choice === null) return levels.includes('medium') ? 'medium' : undefined
  if (choice === 'api_default') return undefined
  return levels.includes(choice) ? choice : undefined
}
