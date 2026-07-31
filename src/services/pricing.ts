import type { ModelInfo } from "./models";
import openaiPricing from "../data/openai-pricing.json";

export type PricingEntry = Pick<
  ModelInfo,
  "pricingPrompt" | "pricingCompletion" | "contextLength"
>;

const TABLE = openaiPricing as Record<string, PricingEntry>;

// Ids OpenAI proposés dans la liste avant tout appel à l'API (prix tirés de TABLE).
const DEFAULT_OPENAI_MODEL_IDS = [
  "gpt-5.4-nano",
  "gpt-5.4-mini",
  "gpt-5.4",
  "gpt-5.5",
  "gpt-5.6",
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
