import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { addExchange, updateExchange, clearExchanges, useHttpExchanges } from '@/store/httpStore'
import { addUsage, resetUsage, useUsage } from '@/store/usageStore'
import { setCachedModels, getCachedModels, useModelsCache } from '@/store/modelsStore'
import type { HttpExchange } from '@/types'

const exchange = (id: string): HttpExchange => ({
  id, timestamp: 1, type: 'llm', method: 'POST', url: 'http://x', requestHeaders: {}, requestBody: null,
})

beforeEach(() => {
  clearExchanges()
  resetUsage()
})

describe('httpStore', () => {
  it('adds and updates exchanges', () => {
    addExchange(exchange('a'))
    updateExchange('a', { responseStatus: 200 })
    const { result } = renderHook(() => useHttpExchanges())
    expect(result.current[0]).toEqual([{ ...exchange('a'), responseStatus: 200 }])
  })

  it('leaves other exchanges untouched on update', () => {
    addExchange(exchange('a'))
    addExchange(exchange('b'))
    updateExchange('b', { error: 'x' })
    const { result } = renderHook(() => useHttpExchanges())
    expect(result.current[0].map(e => e.error)).toEqual([undefined, 'x'])
  })

  it('re-renders subscribers when exchanges change and clears via the hook', () => {
    const { result } = renderHook(() => useHttpExchanges())
    act(() => addExchange(exchange('c')))
    expect(result.current[0]).toHaveLength(1)
    act(() => result.current[1]())
    expect(result.current[0]).toHaveLength(0)
  })

  it('unsubscribes listeners on unmount', () => {
    const { result, unmount } = renderHook(() => useHttpExchanges())
    unmount()
    act(() => addExchange(exchange('d')))
    expect(result.current[0]).toHaveLength(0)
  })
})

describe('usageStore', () => {
  it('accumulates token usage and resets it', () => {
    addUsage({ promptTokens: 2, completionTokens: 3 })
    addUsage({ promptTokens: 1, completionTokens: 1 })
    const { result } = renderHook(() => useUsage())
    expect(result.current[0]).toEqual({ promptTokens: 3, completionTokens: 4 })
    act(() => result.current[1]())
    expect(result.current[0]).toEqual({ promptTokens: 0, completionTokens: 0 })
  })

  it('updates subscribers on add', () => {
    const { result } = renderHook(() => useUsage())
    act(() => addUsage({ promptTokens: 5, completionTokens: 0 }))
    expect(result.current[0].promptTokens).toBe(5)
  })
})

describe('modelsStore', () => {
  it('caches models per provider', () => {
    setCachedModels('ollama', [{ id: 'llama' }])
    expect(getCachedModels('ollama')).toEqual([{ id: 'llama' }])
    expect(getCachedModels('openai')).toBeUndefined()
  })

  it('notifies hook consumers for their provider', () => {
    const { result } = renderHook(() => useModelsCache('lmstudio'))
    expect(result.current).toBeUndefined()
    act(() => setCachedModels('lmstudio', [{ id: 'qwen' }]))
    expect(result.current).toEqual([{ id: 'qwen' }])
  })

  it('unsubscribes on unmount', () => {
    const spy = vi.fn()
    const { unmount } = renderHook(() => useModelsCache('ovh'))
    unmount()
    act(() => setCachedModels('ovh', []))
    expect(spy).not.toHaveBeenCalled()
  })
})
