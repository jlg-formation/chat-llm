import type { AppConfig, ReasoningEffort } from '../../types'

// Table codée en dur : /v1/models ne renvoie pas les niveaux d'effort.
const ALL_LEVELS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const NO_NONE: ReasoningEffort[] = ALL_LEVELS.filter((e) => e !== 'none')
const NO_MINIMAL: ReasoningEffort[] = ALL_LEVELS.filter((e) => e !== 'minimal')
const NO_NONE_NO_MINIMAL: ReasoningEffort[] = NO_NONE.filter((e) => e !== 'minimal')
const GPT_5_LEVELS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
const GOOGLE_LOW_HIGH: ReasoningEffort[] = ['low', 'medium', 'high']
const GOOGLE_MINIMAL_HIGH: ReasoningEffort[] = ['minimal', 'low', 'medium', 'high']
const GOOGLE_LOW_XHIGH: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh']
const GOOGLE_LOW_HIGH_ONLY: ReasoningEffort[] = ['low', 'high']

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
  'gemini-4-carbon': GOOGLE_LOW_HIGH,
  'gemini-4-argon': GOOGLE_LOW_HIGH,
  'gemini-4-neon': GOOGLE_LOW_XHIGH,
  'gemini-4-hydrogen': GOOGLE_LOW_XHIGH,
  'gemini-3.8-flash': GOOGLE_LOW_HIGH,
  'gemini-3.6-flash': GOOGLE_MINIMAL_HIGH,
  'gemini-3.5-flash-lite': GOOGLE_MINIMAL_HIGH,
  'gemini-3.1-pro-preview': GOOGLE_LOW_HIGH,
  'gemini-3.1-flash-lite': GOOGLE_MINIMAL_HIGH,
  'gemini-3-flash-preview': GOOGLE_MINIMAL_HIGH,
  'gemini-3-pro-preview': GOOGLE_LOW_HIGH_ONLY,
  'gemini-2.5-pro': GOOGLE_LOW_HIGH,
  'gemini-2.5-flash': GOOGLE_LOW_HIGH,
  'gemini-2.5-flash-lite': GOOGLE_LOW_HIGH,
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

/** `thinking_level` Google envoyé, ou undefined (défaut API si pas de choix). */
export function resolveGoogleThinkingLevel(config: AppConfig): ReasoningEffort | undefined {
  if (config.llm.apiFormat !== 'google_interactions') return undefined
  const levels = getReasoningEfforts(config.llm.model)
  const choice = config.llm.reasoningEffort
  if (!levels || choice === null || choice === 'api_default') return undefined
  return levels.includes(choice) ? choice : undefined
}
