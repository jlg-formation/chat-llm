import type { Provider } from '../types'

export interface ModelInfo {
  id: string
  ownedBy?: string
  contextLength?: number
  maxCompletionTokens?: number
  pricingPrompt?: number    // USD par token
  pricingCompletion?: number
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

  const endpoint = provider === 'lmstudio' ? `${base}/api/v1/models` : `${base}/v1/models`
  const r = await fetch(endpoint, { headers })
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
