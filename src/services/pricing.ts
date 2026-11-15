import type { ModelInfo } from "./models";
import openaiPricing from "../data/openai-pricing.json";
import anthropicPricing from "../data/anthropic-pricing.json";
import mistralPricing from "../data/mistral-pricing.json";

export type PricingEntry = Pick<
  ModelInfo,
  "pricingPrompt" | "pricingCompletion" | "contextLength" | "longContext"
>;

const TABLE = {
  ...openaiPricing,
  ...anthropicPricing,
  ...mistralPricing,
} as Record<string, PricingEntry>;

const DEFAULT_MISTRAL_MODEL_IDS = [
  "mistral-small-latest",
  "mistral-large-latest",
];

const DEFAULT_ANTHROPIC_MODEL_IDS = [
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-fable-5-2",
];

// Ids OpenAI proposés dans la liste avant tout appel à l'API (prix tirés de TABLE).
const DEFAULT_OPENAI_MODEL_IDS = [
  "gpt-5.4-nano",
  "gpt-5.4-mini",
  "gpt-5.4",
  "gpt-5.5",
  "gpt-5.6",
  "gpt-6-luna",
  "gpt-6-sol",
  "gpt-6-astra",
];

/** Prix d'un modèle : correspondance exacte, sinon plus long préfixe connu (variantes datées). */
export function getStaticPricing(modelId: string): PricingEntry | undefined {
  if (TABLE[modelId]) return TABLE[modelId];
  let best: string | undefined;
  for (const key of Object.keys(TABLE)) {
    if (
      modelId.startsWith(key) &&
      (best === undefined || key.length > best.length)
    )
      best = key;
  }
  return best ? TABLE[best] : undefined;
}

export function getDefaultOpenAiModels(): ModelInfo[] {
  return DEFAULT_OPENAI_MODEL_IDS.map((id) => ({
    id,
    ...getStaticPricing(id),
  }));
}

export function getDefaultAnthropicModels(): ModelInfo[] {
  return DEFAULT_ANTHROPIC_MODEL_IDS.map((id) => ({
    id,
    ...getStaticPricing(id),
  }));
}

export function getDefaultMistralModels(): ModelInfo[] {
  return DEFAULT_MISTRAL_MODEL_IDS.map((id) => ({
    id,
    ...getStaticPricing(id),
  }));
}
