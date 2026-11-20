import type { AppConfig } from '../../types'
import { isAnthropic } from './helpers'
import { ANTHROPIC_DEFAULT_MAX_TOKENS } from './bodyBuildersAnthropic'

// Les noms de champs diffèrent selon le format pour la limite de tokens.
export function applySampling(
  body: Record<string, unknown>,
  config: AppConfig,
  maxTokensField: string,
  reasoningActive = false,
) {
  // Anthropic : temperature/top_p jamais envoyés, max_tokens toujours présent
  if (isAnthropic(config)) {
    body[maxTokensField] = config.llm.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS
    return
  }
  // Modèles de raisonnement : temperature/top_p refusés sauf effort 'none'
  if (!reasoningActive) {
    if (config.llm.temperature !== null) body.temperature = config.llm.temperature
    if (config.llm.topP !== null) body.top_p = config.llm.topP
  }
  if (config.llm.maxTokens !== null) body[maxTokensField] = config.llm.maxTokens
}
