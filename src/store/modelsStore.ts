import { useSyncExternalStore } from "react";
import type { ModelInfo } from "../services/models";
import type { Provider } from "../types";
import { createObservable } from "./observable";

let cache: Partial<Record<Provider, ModelInfo[]>> = {};
const { notify, subscribe } = createObservable();

export function setCachedModels(provider: Provider, models: ModelInfo[]) {
  cache = { ...cache, [provider]: models };
  notify();
}

export function useModelsCache(provider: Provider): ModelInfo[] | undefined {
  return useSyncExternalStore(subscribe, () => cache[provider]);
}
