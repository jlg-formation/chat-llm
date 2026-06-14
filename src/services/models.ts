import type { Provider } from '../types'

export interface ModelInfo {
  id: string
  ownedBy?: string
  contextLength?: number
  maxCompletionTokens?: number
  pricingPrompt?: number    // USD par token
  pricingCompletion?: number
  supportsToolUse?: boolean
}

export async function fetchModels(provider: Provider, baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  const base = baseUrl.replace(/\/$/, '')

  if (provider === 'ollama') {
    const r = await fetch(`${base}/api/tags`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const json = await r.json() as { models?: Array<{ name: string }> }
    return (json.models ?? []).map(m => ({ id: m.name }))
  }

  const headers: Record<string, string> = {}
  if (provider === 'ovh') {
    if (apiKey) headers['X-Auth-Token'] = apiKey
  } else {
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  }

  if (provider === 'lmstudio') {
    const r = await fetch(`${base}/api/v1/models`, { headers })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const json = await r.json() as {
      models?: Array<{
        key: string
        display_name?: string
        type?: string
        publisher?: string
        max_context_length?: number
        capabilities?: { vision?: boolean; trained_for_tool_use?: boolean }
      }>
    }
    return (json.models ?? [])
      .filter(m => m.type !== 'embedding')
      .map(m => ({
        id: m.key,
        ownedBy: m.publisher,
        contextLength: m.max_context_length || undefined,
        supportsToolUse: m.capabilities?.trained_for_tool_use ?? undefined,
      }))
  }

  const r = await fetch(`${base}/v1/models`, { headers })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const json = await r.json() as {
    data?: Array<{
      id: string
      owned_by?: string
      type?: string
      context_length?: number
      max_completion_tokens?: number
      pricing?: { prompt?: string; completion?: string }
    }>
  }

  return (json.data ?? []).filter(m => m.type !== 'embedding').map(m => ({
    id: m.id,
    ownedBy: m.owned_by,
    contextLength: m.context_length || undefined,
    maxCompletionTokens: m.max_completion_tokens || undefined,
    pricingPrompt: m.pricing?.prompt ? parseFloat(m.pricing.prompt) : undefined,
    pricingCompletion: m.pricing?.completion ? parseFloat(m.pricing.completion) : undefined,
  }))
}
