import type { Provider } from "../types";
import { ANTHROPIC_VERSION } from "../types";

export interface ModelInfo {
  id: string;
  ownedBy?: string;
  contextLength?: number;
  maxCompletionTokens?: number;
  pricingPrompt?: number; // USD par token
  pricingCompletion?: number;
  supportsToolUse?: boolean;
  // Palier tarifaire au-delà d'un seuil de tokens de prompt (Anthropic Haiku)
  longContext?: {
    threshold: number;
    pricingPrompt: number;
    pricingCompletion: number;
  };
}

async function getJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

function authHeaders(
  provider: Provider,
  apiKey: string,
): Record<string, string> {
  if (!apiKey || provider === "ollama") return {};
  if (provider === "anthropic") {
    return {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }
  return provider === "ovh"
    ? { "X-Auth-Token": apiKey }
    : { Authorization: `Bearer ${apiKey}` };
}

export async function fetchModels(
  provider: Provider,
  baseUrl: string,
  apiKey: string,
): Promise<ModelInfo[]> {
  const base = baseUrl.replace(/\/$/, "");
  const headers = authHeaders(provider, apiKey);

  if (provider === "ollama") {
    const json = await getJson<{ models?: Array<{ name: string }> }>(
      `${base}/api/tags`,
      headers,
    );
    return (json.models ?? []).map((m) => ({ id: m.name }));
  }

  if (provider === "anthropic") {
    const json = await getJson<{ data?: Array<{ id: string }> }>(
      `${base}/v1/models?limit=1000`,
      headers,
    );
    return (json.data ?? []).map((m) => ({ id: m.id }));
  }

  if (provider === "lmstudio") {
    const json = await getJson<{
      models?: Array<{
        key: string;
        display_name?: string;
        type?: string;
        publisher?: string;
        max_context_length?: number;
        capabilities?: { vision?: boolean; trained_for_tool_use?: boolean };
      }>;
    }>(`${base}/api/v1/models`, headers);
    return (json.models ?? [])
      .filter((m) => m.type !== "embedding")
      .map((m) => ({
        id: m.key,
        ownedBy: m.publisher,
        contextLength: m.max_context_length || undefined,
        supportsToolUse: m.capabilities?.trained_for_tool_use ?? undefined,
      }));
  }

  const json = await getJson<{
    data?: Array<{
      id: string;
      owned_by?: string;
      type?: string;
      context_length?: number;
      max_completion_tokens?: number;
      pricing?: { prompt?: string; completion?: string };
    }>;
  }>(`${base}/v1/models`, headers);

  return (json.data ?? [])
    .filter((m) => m.type !== "embedding")
    .map((m) => ({
      id: m.id,
      ownedBy: m.owned_by,
      contextLength: m.context_length || undefined,
      maxCompletionTokens: m.max_completion_tokens || undefined,
      pricingPrompt: m.pricing?.prompt
        ? parseFloat(m.pricing.prompt)
        : undefined,
      pricingCompletion: m.pricing?.completion
        ? parseFloat(m.pricing.completion)
        : undefined,
    }));
}
