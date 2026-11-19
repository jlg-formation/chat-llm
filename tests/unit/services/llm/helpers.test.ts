import { describe, it, expect } from "vitest";
import {
  currentApiKey,
  usesResponsesAPI,
  usesOllamaNative,
  getEndpoint,
  getHeaders,
  getPedagogicHeaders,
  imageGenerationActive,
  imageGenerationAvailable,
} from "@/services/llm/helpers";
import { makeConfig } from "../../fixtures";
import type { LLMConfig } from "@/types";

describe("currentApiKey", () => {
  it("returns the key of the active provider", () => {
    const config = makeConfig(
      {},
      {
        provider: "ovh",
        apiKeys: {
          openai: "",
          anthropic: "",
          mistral: "",
          ovh: "k-ovh",
          lmstudio: "",
          ollama: "",
          google: "",
        },
      },
    );
    expect(currentApiKey(config)).toBe("k-ovh");
  });

  it("returns an empty string when the key is missing", () => {
    const config = makeConfig(
      {},
      { provider: "openai", apiKeys: {} as LLMConfig["apiKeys"] },
    );
    expect(currentApiKey(config)).toBe("");
  });
});

describe("format predicates", () => {
  it("detects the responses format", () => {
    expect(usesResponsesAPI(makeConfig({}, { apiFormat: "responses" }))).toBe(
      true,
    );
    expect(
      usesResponsesAPI(makeConfig({}, { apiFormat: "chat_completions" })),
    ).toBe(false);
  });

  it("detects the ollama native format", () => {
    expect(usesOllamaNative(makeConfig({}, { apiFormat: "ollama_chat" }))).toBe(
      true,
    );
    expect(usesOllamaNative(makeConfig({}, { apiFormat: "responses" }))).toBe(
      false,
    );
  });
});

describe("image generation availability", () => {
  const hosted = {
    webSearch: false,
    imageGeneration: true,
    imageModel: "gpt-image-2.6-flare",
    imageSize: "640x1024",
  };

  it("is available for openai + responses with a whitelisted model", () => {
    expect(
      imageGenerationAvailable(makeConfig({}, { model: "gpt-6-luna" })),
    ).toBe(true);
  });

  it("is unavailable for a non-whitelisted model", () => {
    expect(
      imageGenerationAvailable(makeConfig({}, { model: "gpt-4o-mini" })),
    ).toBe(false);
  });

  it("is unavailable for other providers or formats", () => {
    expect(
      imageGenerationAvailable(
        makeConfig({}, { provider: "ovh", model: "gpt-6-luna" }),
      ),
    ).toBe(false);
    expect(
      imageGenerationAvailable(
        makeConfig({}, { apiFormat: "chat_completions", model: "gpt-6-luna" }),
      ),
    ).toBe(false);
  });

  it("is active only when the flag is on and available", () => {
    expect(
      imageGenerationActive(
        makeConfig({ hostedTools: hosted }, { model: "gpt-6-luna" }),
      ),
    ).toBe(true);
    expect(
      imageGenerationActive(
        makeConfig({ hostedTools: { ...hosted, imageGeneration: false } }),
      ),
    ).toBe(false);
    expect(
      imageGenerationActive(
        makeConfig({ hostedTools: hosted }, { model: "gpt-4o-mini" }),
      ),
    ).toBe(false);
  });
});

describe("getEndpoint", () => {
  it.each([
    ["ollama_chat", "http://h/api/chat"],
    ["lmstudio_chat", "http://h/api/v1/chat"],
    ["responses", "http://h/v1/responses"],
    ["chat_completions", "http://h/v1/chat/completions"],
  ] as const)("builds the endpoint for %s", (apiFormat, expected) => {
    expect(
      getEndpoint(makeConfig({}, { baseUrl: "http://h/", apiFormat })),
    ).toBe(expected);
  });
});

describe("getHeaders", () => {
  it("requests SSE when streaming is enabled and JSON otherwise", () => {
    expect(getHeaders(makeConfig({ streamEnabled: true })).Accept).toBe(
      "text/event-stream",
    );
    expect(getHeaders(makeConfig({ streamEnabled: false })).Accept).toBe(
      "application/json",
    );
  });

  it("adds a bearer token when a key is set", () => {
    const config = makeConfig(
      {},
      {
        apiKeys: {
          openai: "sk-abc",
          anthropic: "",
          mistral: "",
          ovh: "",
          lmstudio: "",
          ollama: "",
          google: "",
        },
      },
    );
    expect(getHeaders(config).Authorization).toBe("Bearer sk-abc");
  });

  it("omits Authorization when no key is set", () => {
    expect(getHeaders(makeConfig()).Authorization).toBeUndefined();
  });
});

describe("getPedagogicHeaders", () => {
  it("masks the bearer token and keeps other headers", () => {
    const config = makeConfig(
      {},
      {
        apiKeys: {
          openai: "sk-1234567890",
          anthropic: "",
          mistral: "",
          ovh: "",
          lmstudio: "",
          ollama: "",
          google: "",
        },
      },
    );
    const result = getPedagogicHeaders(
      {
        Authorization: "Bearer sk-1234567890",
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      config,
    );
    expect(result).toEqual({
      Authorization: "Bearer sk-12345…",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    });
  });

  it("shows a placeholder when the key is empty", () => {
    const result = getPedagogicHeaders(
      { Authorization: "Bearer x" },
      makeConfig(),
    );
    expect(result).toEqual({ Authorization: "Bearer (non définie)" });
  });

  it("omits headers that are absent", () => {
    expect(getPedagogicHeaders({}, makeConfig())).toEqual({});
  });
});
