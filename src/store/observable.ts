/** Mécanique d'abonnement partagée par les stores (notify + subscribe pour useSyncExternalStore). */
export function createObservable() {
  const listeners = new Set<() => void>()
  return {
    notify() {
      listeners.forEach((l) => l())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
