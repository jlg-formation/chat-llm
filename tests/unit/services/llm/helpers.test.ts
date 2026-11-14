import { describe, it, expect } from "vitest";
import {
  currentApiKey,
  usesResponsesAPI,
  usesOllamaNative,
  getEndpoint,
  getHeaders,
  getPedagogicHeaders,
} from "@/services/llm/helpers";
import { makeConfig } from "../../fixtures";
import type { LLMConfig } from "@/types";

describe("currentApiKey", () => {
  it("returns the key of the active provider", () => {
    const config = makeConfig(
      {},
      {
        provider: "ovh",
        apiKeys: { openai: "", anthropic: "", ovh: "k-ovh", lmstudio: "", ollama: "" },
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
      { apiKeys: { openai: "sk-abc", anthropic: "", ovh: "", lmstudio: "", ollama: "" } },
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
        apiKeys: { openai: "sk-1234567890", anthropic: "", ovh: "", lmstudio: "", ollama: "" },
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
