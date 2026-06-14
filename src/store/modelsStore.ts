import { useState, useEffect } from 'react'
import type { ModelInfo } from '../services/models'
import type { Provider } from '../types'

let cache: Partial<Record<Provider, ModelInfo[]>> = {}
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach(l => l())
}

export function setCachedModels(provider: Provider, models: ModelInfo[]) {
  cache = { ...cache, [provider]: models }
  notify()
}

export function getCachedModels(provider: Provider): ModelInfo[] | undefined {
  return cache[provider]
}

export function useModelsCache(provider: Provider): ModelInfo[] | undefined {
  const [models, setModels] = useState<ModelInfo[] | undefined>(cache[provider])
  useEffect(() => {
    const h = () => setModels(cache[provider])
    listeners.add(h)
    return () => { listeners.delete(h) }
  }, [provider])
  return models
}
