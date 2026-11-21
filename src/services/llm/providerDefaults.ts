import type { ApiFormat, Provider } from '../../types'

export const DEFAULT_MODEL: Record<Provider, string> = {
  openai: 'gpt-6-luna',
  anthropic: 'claude-haiku-5-5',
  mistral: 'ministral-3b-latest',
  ovh: 'gpt-oss-20b',
  lmstudio: '',
  ollama: '',
  google: 'gemini-3.8-flash',
}

// Format utilisé par défaut quand un provider est choisi (aligné sur ProviderSection)
export const DEFAULT_API_FORMAT: Record<Provider, ApiFormat> = {
  openai: 'responses',
  anthropic: 'anthropic_messages',
  mistral: 'chat_completions',
  ovh: 'chat_completions',
  lmstudio: 'lmstudio_chat',
  ollama: 'ollama_chat',
  google: 'chat_completions',
}
