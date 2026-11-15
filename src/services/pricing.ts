import type { ModelInfo } from "./models";
import type { Provider } from "../types";
import openaiPricing from "../data/openai-pricing.json";
import anthropicPricing from "../data/anthropic-pricing.json";
import mistralPricing from "../data/mistral-pricing.json";
import ovhPricing from "../data/ovh-pricing.json";

type PricingEntry = Pick<
  ModelInfo,
  "pricingPrompt" | "pricingCompletion" | "contextLength" | "longContext"
>;

type PricingTable = Record<string, PricingEntry>;

// Une table par provider : un même id peut avoir des prix différents d'un provider à l'autre.
const TABLES: Partial<Record<Provider, PricingTable>> = {
  openai: openaiPricing as PricingTable,
  anthropic: anthropicPricing as PricingTable,
  mistral: mistralPricing as PricingTable,
  ovh: ovhPricing as PricingTable,
};

const ALL_PROVIDERS_TABLE: PricingTable = Object.assign(
  {},
  ...Object.values(TABLES),
);

const DEFAULT_MISTRAL_MODEL_IDS = [
  "ministral-3b-latest",
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

/**
 * Prix d'un modèle : correspondance exacte, sinon plus long préfixe connu (variantes datées).
 * Sans `provider`, toutes les tables sont fusionnées ; avec un provider sans table (local), aucun prix.
 */
export function getStaticPricing(
  modelId: string,
  provider?: Provider,
): PricingEntry | undefined {
  const table = provider ? TABLES[provider] : ALL_PROVIDERS_TABLE;
  if (!table) return undefined;
  if (table[modelId]) return table[modelId];
  let best: string | undefined;
  for (const key of Object.keys(table)) {
    if (
      modelId.startsWith(key) &&
      (best === undefined || key.length > best.length)
    )
      best = key;
  }
  return best ? table[best] : undefined;
}

export function getDefaultOpenAiModels(): ModelInfo[] {
  return DEFAULT_OPENAI_MODEL_IDS.map((id) => ({
    id,
    ...getStaticPricing(id, "openai"),
  }));
}

export function getDefaultAnthropicModels(): ModelInfo[] {
  return DEFAULT_ANTHROPIC_MODEL_IDS.map((id) => ({
    id,
    ...getStaticPricing(id, "anthropic"),
  }));
}

export function getDefaultMistralModels(): ModelInfo[] {
  return DEFAULT_MISTRAL_MODEL_IDS.map((id) => ({
    id,
    ...getStaticPricing(id, "mistral"),
  }));
}
