import { describe, it, expect } from "vitest";
import {
  getEndpoint,
  getHeaders,
  getPedagogicHeaders,
  usesAnthropicNative,
} from "@/services/llm/helpers";
import {
  buildAnthropicBody,
  ANTHROPIC_DEFAULT_MAX_TOKENS,
} from "@/services/llm/bodyBuildersAnthropic";
import { buildBody } from "@/services/llm/bodyBuilders";
import { makeConfig, makeMessage } from "../../fixtures";
import type { LLMConfig } from "@/types";

const native = (llm: Partial<LLMConfig> = {}, top = {}) =>
  makeConfig(top, {
    provider: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-haiku-5-5",
    apiFormat: "anthropic_messages",
    apiKeys: {
      openai: "",
      anthropic: "sk-ant-1234567890",
      ovh: "",
      lmstudio: "",
      ollama: "",
    },
    ...llm,
  });

type Body = Record<string, unknown>;
const build = (
  config = native(),
  messages = [makeMessage({ role: "user", content: "Salut" })],
) => buildAnthropicBody(config, messages, "", [], []) as Body;

describe("anthropic helpers", () => {
  it("targets /v1/messages for the native format", () => {
    expect(getEndpoint(native())).toBe("https://api.anthropic.com/v1/messages");
    expect(usesAnthropicNative(native())).toBe(true);
  });

  it("keeps /v1/chat/completions in compatible mode", () => {
    expect(getEndpoint(native({ apiFormat: "chat_completions" }))).toBe(
      "https://api.anthropic.com/v1/chat/completions",
    );
  });

  it("sends x-api-key and anthropic headers, never Authorization", () => {
    const headers = getHeaders(native());
    expect(headers["x-api-key"]).toBe("sk-ant-1234567890");
    expect(headers["anthropic-version"]).toBe("2026-10-21");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(headers.Authorization).toBeUndefined();
  });

  it("omits x-api-key when no key is set", () => {
    const config = native({
      apiKeys: { openai: "", anthropic: "", ovh: "", lmstudio: "", ollama: "" },
    });
    expect(getHeaders(config)["x-api-key"]).toBeUndefined();
  });

  it("masks x-api-key in pedagogic headers", () => {
    const config = native();
    const result = getPedagogicHeaders(getHeaders(config), config);
    expect(result["x-api-key"]).toBe("sk-ant-1…");
    expect(result["anthropic-version"]).toBe("2026-10-21");
  });
});

describe("buildAnthropicBody", () => {
  it("always sends max_tokens with the default and never sampling params", () => {
    const body = build(native({ temperature: 0.5, topP: 0.5 }));
    expect(body.max_tokens).toBe(ANTHROPIC_DEFAULT_MAX_TOKENS);
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
  });

  it("uses the configured max tokens", () => {
    expect(build(native({ maxTokens: 123 })).max_tokens).toBe(123);
  });

  it("toggles thinking display", () => {
    expect(build(native({ showThinking: true })).thinking).toEqual({
      type: "adaptive",
      display: "summarized",
    });
    expect(build().thinking).toEqual({ type: "adaptive", display: "omitted" });
  });

  it("puts the system prompt in the system field", () => {
    const body = buildAnthropicBody(native(), [], "Sois bref", [], []) as Body;
    expect(body.system).toBe("Sois bref");
    expect(build()).not.toHaveProperty("system");
  });

  it("converts images to base64 blocks before the text", () => {
    const body = build(native(), [
      makeMessage({
        role: "user",
        content: "Décris",
        images: [
          { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" },
        ],
      }),
    ]);
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: "AAAA" },
          },
          { type: "text", text: "Décris" },
        ],
      },
    ]);
  });

  it("skips error and empty assistant messages", () => {
    const body = build(native(), [
      makeMessage({ role: "user", content: "a" }),
      makeMessage({ role: "assistant", content: "oops", isError: true }),
      makeMessage({ role: "assistant", content: "" }),
    ]);
    expect(body.messages).toHaveLength(1);
  });

  it("extracts the inner schema into output_config", () => {
    const schema = {
      type: "object",
      properties: {},
      additionalProperties: false,
    };
    const wrapped = native(
      {},
      { jsonSchema: JSON.stringify({ name: "x", schema }) },
    );
    expect(build(wrapped).output_config).toEqual({
      format: { type: "json_schema", schema },
    });
    const bare = native({}, { jsonSchema: JSON.stringify(schema) });
    expect(build(bare).output_config).toEqual({
      format: { type: "json_schema", schema },
    });
  });

  it("ignores an invalid or null schema", () => {
    expect(build(native({}, { jsonSchema: "{oops" }))).not.toHaveProperty(
      "output_config",
    );
    expect(build(native({}, { jsonSchema: "null" }))).not.toHaveProperty(
      "output_config",
    );
  });

  it("exposes tools in Anthropic format with tool_choice auto", () => {
    const body = buildAnthropicBody(
      native(),
      [],
      "",
      [{ name: "s", description: "d" }],
      [
        {
          name: "recherche",
          description: "Cherche",
          enabled: true,
          inputSchema: {},
        },
      ],
    ) as Body;
    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools.map((t) => t.name)).toEqual([
      "get_skill_details",
      "recherche",
    ]);
    expect(tools[1].input_schema).toEqual({ type: "object" });
    expect(body.tool_choice).toEqual({ type: "auto" });
  });

  it("groups tool calls/results per turn and replays thinking blocks", () => {
    const thinking = [{ type: "thinking", thinking: "hm", signature: "sig" }];
    const body = build(native(), [
      makeMessage({ role: "user", content: "go" }),
      makeMessage({
        role: "tool_call",
        toolCallId: "t1",
        toolName: "a",
        toolArgs: '{"x":1}',
        toolTurnId: "A",
        thinkingBlocks: thinking,
      }),
      makeMessage({
        role: "tool_result",
        toolCallResultId: "t1",
        content: "r1",
        toolTurnId: "A",
      }),
      makeMessage({
        role: "tool_call",
        toolCallId: "t2",
        toolName: "b",
        toolArgs: "{}",
        toolTurnId: "A",
      }),
      makeMessage({
        role: "tool_result",
        toolCallResultId: "t2",
        content: "r2",
        toolTurnId: "A",
      }),
      makeMessage({
        role: "tool_call",
        toolCallId: "t3",
        toolName: "c",
        toolArgs: "{}",
        toolTurnId: "B",
      }),
      makeMessage({
        role: "tool_result",
        toolCallResultId: "t3",
        content: "r3",
        toolTurnId: "B",
      }),
    ]);
    expect(body.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "go" }] },
      {
        role: "assistant",
        content: [
          ...thinking,
          { type: "tool_use", id: "t1", name: "a", input: { x: 1 } },
          { type: "tool_use", id: "t2", name: "b", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "r1" },
          { type: "tool_result", tool_use_id: "t2", content: "r2" },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t3", name: "c", input: {} }],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t3", content: "r3" }],
      },
    ]);
  });
});

describe("buildBody dispatch for anthropic", () => {
  it("uses the native builder", () => {
    const body = buildBody(native(), [], "", [], []) as Body;
    expect(body).toHaveProperty("thinking");
    expect(body).toHaveProperty("max_tokens");
  });

  it("compatible mode: no sampling, default max tokens, strict schema", () => {
    const config = native(
      { apiFormat: "chat_completions", temperature: 0.7, topP: 0.9 },
      { jsonSchema: JSON.stringify({ name: "x", schema: { type: "object" } }) },
    );
    const body = buildBody(config, [], "", [], []) as Body;
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
    expect(body.max_completion_tokens).toBe(ANTHROPIC_DEFAULT_MAX_TOKENS);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "x", schema: { type: "object" }, strict: true },
    });
  });
});
