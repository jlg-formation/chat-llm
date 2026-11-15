import type { AppConfig } from '../../types'
import { ANTHROPIC_VERSION } from '../../types'

function sanitizeKey(key: string) {
  if (!key) return '(non définie)'
  return key.slice(0, 8) + '…'
}

export function currentApiKey(config: AppConfig): string {
  return config.llm.apiKeys[config.llm.provider] ?? ''
}

export const usesResponsesAPI = (c: AppConfig) => c.llm.apiFormat === 'responses'

export const usesOllamaNative = (c: AppConfig) => c.llm.apiFormat === 'ollama_chat'

export const usesAnthropicNative = (c: AppConfig) => c.llm.apiFormat === 'anthropic_messages'

export const isAnthropic = (c: AppConfig) => c.llm.provider === 'anthropic'

export const isMistral = (c: AppConfig) => c.llm.provider === 'mistral'

export function getEndpoint(config: AppConfig): string {
  const base = config.llm.baseUrl.replace(/\/$/, '')
  // La base Mistral inclut déjà /v1
  if (isMistral(config))
    return `${base}/${config.llm.apiFormat === 'responses' ? 'responses' : 'chat/completions'}`
  if (config.llm.apiFormat === 'anthropic_messages') return `${base}/v1/messages`
  if (config.llm.apiFormat === 'ollama_chat') return `${base}/api/chat`
  if (config.llm.apiFormat === 'lmstudio_chat') return `${base}/api/v1/chat`
  if (config.llm.apiFormat === 'responses') return `${base}/v1/responses`
  return `${base}/v1/chat/completions`
}

export function getHeaders(config: AppConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: config.streamEnabled ? 'text/event-stream' : 'application/json',
  }
  const key = currentApiKey(config)
  if (isAnthropic(config)) {
    if (key) headers['x-api-key'] = key
    headers['anthropic-version'] = ANTHROPIC_VERSION
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
    return headers
  }
  if (key) {
    headers['Authorization'] = `Bearer ${key}`
  }
  return headers
}

export function getPedagogicHeaders(
  headers: Record<string, string>,
  config: AppConfig,
): Record<string, string> {
  const result: Record<string, string> = {}
  if (headers['Authorization'])
    result['Authorization'] = `Bearer ${sanitizeKey(currentApiKey(config))}`
  if (headers['x-api-key']) result['x-api-key'] = sanitizeKey(currentApiKey(config))
  for (const k of ['anthropic-version', 'anthropic-dangerous-direct-browser-access'])
    if (headers[k]) result[k] = headers[k]
  if (headers['Content-Type']) result['Content-Type'] = headers['Content-Type']
  if (headers['Accept']) result['Accept'] = headers['Accept']
  return result
}
