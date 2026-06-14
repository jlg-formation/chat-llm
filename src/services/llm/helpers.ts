import type { AppConfig } from '../../types'

export function genId() {
  return Math.random().toString(36).slice(2)
}

function sanitizeKey(key: string) {
  if (!key) return '(non définie)'
  return key.slice(0, 8) + '…'
}

export function currentApiKey(config: AppConfig): string {
  return config.llm.apiKeys[config.llm.provider] ?? ''
}

export const usesResponsesAPI = (c: AppConfig) =>
  c.llm.provider !== 'ollama' && c.llm.apiFormat === 'responses'

export function getEndpoint(config: AppConfig): string {
  const base = config.llm.baseUrl.replace(/\/$/, '')
  if (config.llm.provider === 'ollama') return `${base}/api/chat`
  if (config.llm.apiFormat === 'lmstudio_chat') return `${base}/api/v1/chat`
  if (usesResponsesAPI(config)) return `${base}/v1/responses`
  return `${base}/v1/chat/completions`
}

export function getHeaders(config: AppConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': config.streamEnabled ? 'text/event-stream' : 'application/json',
  }
  const key = currentApiKey(config)
  if (key) {
    if (config.llm.provider === 'ovh') {
      headers['X-Auth-Token'] = key
    } else {
      headers['Authorization'] = `Bearer ${key}`
    }
  }
  return headers
}

export function getPedagogicHeaders(headers: Record<string, string>, config: AppConfig): Record<string, string> {
  const result: Record<string, string> = {}
  if (headers['Authorization']) result['Authorization'] = `Bearer ${sanitizeKey(currentApiKey(config))}`
  if (headers['X-Auth-Token']) result['X-Auth-Token'] = sanitizeKey(currentApiKey(config))
  if (headers['Content-Type']) result['Content-Type'] = headers['Content-Type']
  if (headers['Accept']) result['Accept'] = headers['Accept']
  return result
}
