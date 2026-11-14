import { useSyncExternalStore } from "react";
import type { TokenUsage } from "../types";
import { createObservable } from "./observable";

let usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
const { notify, subscribe } = createObservable();

export function addUsage(delta: TokenUsage) {
  usage = {
    promptTokens: usage.promptTokens + delta.promptTokens,
    completionTokens: usage.completionTokens + delta.completionTokens,
  };
  notify();
}

export function resetUsage() {
  usage = { promptTokens: 0, completionTokens: 0 };
  notify();
}

export function useUsage(): [TokenUsage, () => void] {
  return [useSyncExternalStore(subscribe, () => usage), resetUsage];
}
