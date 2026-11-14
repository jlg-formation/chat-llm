import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchModels } from "./models";
import { jsonResponse } from "../test/fixtures";

const fetchMock = vi.fn();

function stubFetch(response: Response) {
  fetchMock.mockResolvedValueOnce(response);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("fetchModels", () => {
  it("lists Ollama models from /api/tags", async () => {
    stubFetch(jsonResponse({ models: [{ name: "llama3" }] }));
    expect(await fetchModels("ollama", "http://o/", "")).toEqual([
      { id: "llama3" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith("http://o/api/tags", {
      headers: {},
    });
  });

  it("returns an empty list when Ollama reports no models", async () => {
    stubFetch(jsonResponse({}));
    expect(await fetchModels("ollama", "http://o", "")).toEqual([]);
  });

  it("throws on a failed Ollama request", async () => {
    stubFetch(new Response("", { status: 500 }));
    await expect(fetchModels("ollama", "http://o", "")).rejects.toThrow(
      "HTTP 500",
    );
  });

  it("maps LM Studio models and drops embeddings", async () => {
    stubFetch(
      jsonResponse({
        models: [
          {
            key: "qwen",
            publisher: "pub",
            max_context_length: 4096,
            capabilities: { trained_for_tool_use: true },
          },
          { key: "emb", type: "embedding" },
          { key: "plain", max_context_length: 0 },
        ],
      }),
    );
    const models = await fetchModels("lmstudio", "http://l", "k");
    expect(models).toEqual([
      {
        id: "qwen",
        ownedBy: "pub",
        contextLength: 4096,
        supportsToolUse: true,
      },
      {
        id: "plain",
        ownedBy: undefined,
        contextLength: undefined,
        supportsToolUse: undefined,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith("http://l/api/v1/models", {
      headers: { Authorization: "Bearer k" },
    });
  });

  it("throws on a failed LM Studio request", async () => {
    stubFetch(new Response("", { status: 403 }));
    await expect(fetchModels("lmstudio", "http://l", "")).rejects.toThrow(
      "HTTP 403",
    );
  });

  it("uses X-Auth-Token for OVH", async () => {
    stubFetch(jsonResponse({ data: [{ id: "gpt-oss-20b" }] }));
    await fetchModels("ovh", "http://ovh", "tok");
    expect(fetchMock).toHaveBeenCalledWith("http://ovh/v1/models", {
      headers: { "X-Auth-Token": "tok" },
    });
  });

  it("maps OpenAI-style models with pricing and drops embeddings", async () => {
    stubFetch(
      jsonResponse({
        data: [
          {
            id: "gpt-x",
            owned_by: "openai",
            context_length: 1000,
            max_completion_tokens: 200,
            pricing: { prompt: "0.000001", completion: "0.000002" },
          },
          { id: "emb", type: "embedding" },
          { id: "bare" },
        ],
      }),
    );
    const models = await fetchModels("openai", "https://api.openai.com/", "");
    expect(models[0]).toEqual({
      id: "gpt-x",
      ownedBy: "openai",
      contextLength: 1000,
      maxCompletionTokens: 200,
      pricingPrompt: 0.000001,
      pricingCompletion: 0.000002,
    });
    expect(models[1]).toEqual({
      id: "bare",
      ownedBy: undefined,
      contextLength: undefined,
      maxCompletionTokens: undefined,
      pricingPrompt: undefined,
      pricingCompletion: undefined,
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/models", {
      headers: {},
    });
  });

  it("returns an empty list when the OpenAI payload has no data", async () => {
    stubFetch(jsonResponse({}));
    expect(await fetchModels("openai", "http://x", "")).toEqual([]);
  });

  it("throws on a failed OpenAI-style request", async () => {
    stubFetch(new Response("", { status: 401 }));
    await expect(fetchModels("openai", "http://x", "")).rejects.toThrow(
      "HTTP 401",
    );
  });
});
