import { useSyncExternalStore } from 'react'
import type { AppConfig, TokenUsage } from '../types'
import { createObservable } from './observable'
import { getStaticPricing } from '../services/pricing'
import { estimateImageCost, getImagePricing } from '../services/imagePricing'

const DEFAULT_SPEND_LIMIT_USD = 0.15
export const SPEND_STORAGE_KEY = 'chat_pedagogique_spend'
export const SPEND_LIMIT_STORAGE_KEY = 'chat_pedagogique_spend_limit'

const { notify, subscribe } = createObservable()

function readStoredSpend(): number {
  const raw = Number(localStorage.getItem(SPEND_STORAGE_KEY))
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

let spentUsd = readStoredSpend()

// Écrit les valeurs par défaut au chargement, si elles n'existent pas encore.
if (localStorage.getItem(SPEND_LIMIT_STORAGE_KEY) === null)
  localStorage.setItem(SPEND_LIMIT_STORAGE_KEY, String(DEFAULT_SPEND_LIMIT_USD))
if (localStorage.getItem(SPEND_STORAGE_KEY) === null) localStorage.setItem(SPEND_STORAGE_KEY, '0')

// Relu à chaque appel : une modification manuelle du localStorage s'applique sans recharger.
export function getSpendLimitUsd(): number {
  const raw = localStorage.getItem(SPEND_LIMIT_STORAGE_KEY)
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SPEND_LIMIT_USD
}

export function isSpendLimitReached(): boolean {
  return spentUsd >= getSpendLimitUsd()
}

export function addSpend(usd: number) {
  if (usd <= 0) return
  spentUsd += usd
  localStorage.setItem(SPEND_STORAGE_KEY, String(spentUsd))
  notify()
}

/** Coût estimé d'un appel LLM (tokens texte + tokens image) ; 0 si les tarifs sont inconnus. */
export function estimateCallCostUsd(config: AppConfig, usage: TokenUsage | undefined): number {
  if (!usage) return 0
  const text = getStaticPricing(config.llm.model, config.llm.provider)
  const textCost =
    usage.promptTokens * (text?.pricingPrompt ?? 0) +
    usage.completionTokens * (text?.pricingCompletion ?? 0)
  const imageModel = config.hostedTools.imageModel
  const imageCost =
    (estimateImageCost(imageModel, usage.imageOutputTokens) ?? 0) +
    ((usage.imageInputTokens ?? 0) * (getImagePricing(imageModel)?.imageInputPerMillion ?? 0)) /
      1_000_000
  return textCost + imageCost
}

export function useSpentUsd(): number {
  return useSyncExternalStore(subscribe, () => spentUsd)
}
