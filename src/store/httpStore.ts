import { useSyncExternalStore } from 'react'
import type { HttpExchange } from '../types'
import { createObservable } from './observable'

let exchanges: HttpExchange[] = []
const { notify, subscribe } = createObservable()

export function addExchange(exchange: HttpExchange) {
  exchanges = [...exchanges, exchange]
  notify()
}

export function updateExchange(id: string, partial: Partial<HttpExchange>) {
  exchanges = exchanges.map((e) => (e.id === id ? { ...e, ...partial } : e))
  notify()
}

export function clearExchanges() {
  exchanges = []
  notify()
}

export function useHttpExchanges(): [HttpExchange[], () => void] {
  const list = useSyncExternalStore(subscribe, () => exchanges)
  return [list, clearExchanges]
}
