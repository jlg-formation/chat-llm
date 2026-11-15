import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getEndpoint,
  getHeaders,
  getPedagogicHeaders,
  isMistral,
} from "@/services/llm/helpers";
import { buildBody } from "@/services/llm/bodyBuilders";
import { fetchModels } from "@/services/models";
import { getDefaultMistralModels, getStaticPricing } from "@/services/pricing";
import { makeConfig, makeMessage, jsonResponse } from "../../fixtures";
import type { LLMConfig } from "@/types";

const mistral = (llm: Partial<LLMConfig> = {}, top = {}) =>
  makeConfig(top, {
    provider: "mistral",
    baseUrl: "https://api.mistral.ai/v1",
    model: "mistral-small-latest",
    apiFormat: "chat_completions",
    apiKeys: {
      openai: "",
      anthropic: "",
      mistral: "mist-1234567890",
      ovh: "",
      lmstudio: "",
      ollama: "",
    },
    ...llm,
  });

type Body = Record<string, unknown>;
const messages = [makeMessage({ role: "user", content: "Salut" })];
const build = (config = mistral()) =>
  buildBody(config, messages, "", [], []) as Body;

describe("mistral helpers", () => {
  it("detects the provider", () => {
    expect(isMistral(mistral())).toBe(true);
  });

  it("builds endpoints without a /v1 prefix (already in the base URL)", () => {
    expect(getEndpoint(mistral())).toBe(
      "https://api.mistral.ai/v1/chat/completions",
    );
    expect(getEndpoint(mistral({ apiFormat: "responses" }))).toBe(
      "https://api.mistral.ai/v1/responses",
    );
    expect(getEndpoint(mistral({ baseUrl: "https://x/v1/" }))).toBe(
      "https://x/v1/chat/completions",
    );
  });

  it("authenticates with a Bearer token masked in pedagogic headers", () => {
    const config = mistral();
    const headers = getHeaders(config);
    expect(headers.Authorization).toBe("Bearer mist-1234567890");
    expect(getPedagogicHeaders(headers, config).Authorization).toBe(
      "Bearer mist-123…",
    );
  });
});

describe("mistral chat_completions body", () => {
  it("uses max_tokens, sends sampling when set, and no stream_options", () => {
    const body = build(mistral({ maxTokens: 50, temperature: 0.3, topP: 0.8 }));
    expect(body.max_tokens).toBe(50);
    expect(body).not.toHaveProperty("max_completion_tokens");
    expect(body.temperature).toBe(0.3);
    expect(body.top_p).toBe(0.8);
    expect(body).not.toHaveProperty("stream_options");
  });

  it("omits max_tokens and sampling when null", () => {
    const body = build();
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("temperature");
  });

  it("keeps non-strict json_schema", () => {
    const body = build(
      mistral({}, { jsonSchema: JSON.stringify({ name: "x", schema: {} }) }),
    );
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "x", schema: {} },
    });
  });
});

describe("mistral responses body", () => {
  it("is stateless with max_output_tokens", () => {
    const body = build(mistral({ apiFormat: "responses", maxTokens: 10 }));
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(10);
    expect(body).not.toHaveProperty("previous_response_id");
    expect(body).not.toHaveProperty("conversation");
  });
});

describe("mistral models", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("lists chat models from {base}/models with Bearer auth", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "mistral-small-latest",
            max_context_length: 256000,
            capabilities: { completion_chat: true },
          },
          { id: "mistral-embed", capabilities: { completion_chat: false } },
          { id: "no-caps", max_context_length: 0 },
        ],
      }),
    );
    const models = await fetchModels(
      "mistral",
      "https://api.mistral.ai/v1/",
      "k",
    );
    expect(models).toEqual([
      { id: "mistral-small-latest", contextLength: 256000 },
      { id: "no-caps", contextLength: undefined },
    ]);
    expect(fetchMock).toHaveBeenCalledWith("https://api.mistral.ai/v1/models", {
      headers: { Authorization: "Bearer k" },
    });
  });

  it("returns an empty list when the payload has no data", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    expect(await fetchModels("mistral", "https://m/v1", "")).toEqual([]);
  });
});

describe("mistral pricing", () => {
  it("provides the static fallback list with prices", () => {
    const models = getDefaultMistralModels();
    expect(models.map((m) => m.id)).toEqual([
      "mistral-small-latest",
      "mistral-large-latest",
    ]);
    expect(models[0].pricingPrompt).toBeCloseTo(1.5e-7);
    expect(getStaticPricing("mistral-large-latest")?.pricingCompletion).toBe(
      0.0000021,
    );
  });

  it("returns no price for an unknown dated variant", () => {
    expect(getStaticPricing("mistral-small-2603")).toBeUndefined();
  });
});
