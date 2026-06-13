import { useState, useEffect } from 'react'
import type { HttpExchange } from '../types'

let exchanges: HttpExchange[] = []
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach(l => l())
}

export function addExchange(exchange: HttpExchange) {
  exchanges = [exchange, ...exchanges]
  notify()
}

export function updateExchange(id: string, partial: Partial<HttpExchange>) {
  exchanges = exchanges.map(e => e.id === id ? { ...e, ...partial } : e)
  notify()
}

export function clearExchanges() {
  exchanges = []
  notify()
}

export function useHttpExchanges(): [HttpExchange[], () => void] {
  const [list, setList] = useState<HttpExchange[]>(exchanges)

  useEffect(() => {
    const handler = () => setList([...exchanges])
    listeners.add(handler)
    return () => { listeners.delete(handler) }
  }, [])

  return [list, clearExchanges]
}
