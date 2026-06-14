import { useState, useEffect } from 'react'
import type { TokenUsage } from '../types'

let usage: TokenUsage = { promptTokens: 0, completionTokens: 0 }
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach(l => l())
}

export function addUsage(delta: TokenUsage) {
  usage = {
    promptTokens: usage.promptTokens + delta.promptTokens,
    completionTokens: usage.completionTokens + delta.completionTokens,
  }
  notify()
}

export function resetUsage() {
  usage = { promptTokens: 0, completionTokens: 0 }
  notify()
}

export function useUsage(): [TokenUsage, () => void] {
  const [u, setU] = useState<TokenUsage>(usage)
  useEffect(() => {
    const h = () => setU({ ...usage })
    listeners.add(h)
    return () => { listeners.delete(h) }
  }, [])
  return [u, resetUsage]
}
