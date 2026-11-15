import { useSyncExternalStore } from "react";
import type { TokenUsage } from "../types";
import { createObservable } from "./observable";
import { estimateImageCost } from "../services/imagePricing";

export interface ImageUsage {
  count: number;
  costUsd: number;
  // Vrai si au moins une image n'a pas de coût estimable
  costUnknown: boolean;
  imageInputTokens: number;
  imageOutputTokens: number;
}

const EMPTY_IMAGE_USAGE: ImageUsage = {
  count: 0,
  costUsd: 0,
  costUnknown: false,
  imageInputTokens: 0,
  imageOutputTokens: 0,
};

let usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
let imageUsage: ImageUsage = EMPTY_IMAGE_USAGE;
const { notify, subscribe } = createObservable();

export function addUsage(delta: TokenUsage) {
  usage = {
    promptTokens: usage.promptTokens + delta.promptTokens,
    completionTokens: usage.completionTokens + delta.completionTokens,
  };
  notify();
}

export function addImageUsage(
  count: number,
  model: string,
  imageOutputTokens?: number,
  imageInputTokens?: number,
) {
  if (count === 0) return;
  const cost = estimateImageCost(model, imageOutputTokens);
  imageUsage = {
    count: imageUsage.count + count,
    costUsd: imageUsage.costUsd + (cost ?? 0),
    costUnknown: imageUsage.costUnknown || cost === undefined,
    imageInputTokens: imageUsage.imageInputTokens + (imageInputTokens ?? 0),
    imageOutputTokens: imageUsage.imageOutputTokens + (imageOutputTokens ?? 0),
  };
  notify();
}

export function resetUsage() {
  usage = { promptTokens: 0, completionTokens: 0 };
  imageUsage = EMPTY_IMAGE_USAGE;
  notify();
}

export function useUsage(): [TokenUsage, () => void] {
  return [useSyncExternalStore(subscribe, () => usage), resetUsage];
}

export function useImageUsage(): ImageUsage {
  return useSyncExternalStore(subscribe, () => imageUsage);
}
