import { describe, it, expect } from "vitest";
import { buildChatCompletionsBody } from "@/services/llm/bodyBuilders";
import { makeConfig, makeMessage } from "../../fixtures";
import type { McpTool } from "@/types";

const skill = [{ name: "demo", description: "Démo" }];
const mcpTools: McpTool[] = [
  { name: "on", description: "", enabled: true },
  { name: "off", description: "", enabled: false },
];

describe("buildChatCompletionsBody", () => {
  it("builds the full message list and sampling parameters", () => {
    const config = makeConfig(
      { streamEnabled: true },
      { temperature: 0.2, topP: 0.9, maxTokens: 100 },
    );
    const messages = [
      makeMessage({ role: "user", content: "hi" }),
      makeMessage({ role: "assistant", content: "yo" }),
      makeMessage({ role: "user", content: "err", isError: true }),
      makeMessage({
        role: "tool_result",
        content: "r",
        toolCallResultId: "c1",
      }),
    ];
    const body = buildChatCompletionsBody(
      config,
      messages,
      "sys",
      [],
      [],
    ) as Record<string, unknown>;
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "yo" },
      { role: "tool", tool_call_id: "c1", content: "r" },
    ]);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.temperature).toBe(0.2);
    expect(body.top_p).toBe(0.9);
    expect(body.max_completion_tokens).toBe(100);
  });

  it("omits null sampling parameters and stream options when not streaming", () => {
    const body = buildChatCompletionsBody(
      makeConfig({ streamEnabled: false }),
      [],
      "",
      [],
      [],
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty("stream_options");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
    expect(body).not.toHaveProperty("max_completion_tokens");
  });

  it("sends images as multipart content", () => {
    const messages = [
      makeMessage({
        role: "user",
        content: "voici",
        images: [{ dataUrl: "data:x", mimeType: "image/png" }],
      }),
    ];
    const body = buildChatCompletionsBody(
      makeConfig(),
      messages,
      "",
      [],
      [],
    ) as {
      messages: unknown[];
    };
    expect(body.messages[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "voici" },
        { type: "image_url", image_url: { url: "data:x" } },
      ],
    });
  });

  it("serializes tool calls as a string for OpenAI-style providers", () => {
    const messages = [
      makeMessage({
        role: "tool_call",
        content: "",
        toolCallId: "t1",
        toolName: "search",
        toolArgs: '{"q":1}',
      }),
    ];
    const body = buildChatCompletionsBody(
      makeConfig(),
      messages,
      "",
      [],
      [],
    ) as {
      messages: unknown[];
    };
    expect(body.messages[0]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "t1",
          type: "function",
          function: { name: "search", arguments: '{"q":1}' },
        },
      ],
    });
  });

  it("serializes tool calls as an object for Ollama native and tolerates invalid args", () => {
    const config = makeConfig({}, { apiFormat: "ollama_chat" });
    const messages = [
      makeMessage({
        role: "tool_call",
        content: "",
        toolCallId: "t1",
        toolName: "x",
        toolArgs: "not-json",
      }),
    ];
    const body = buildChatCompletionsBody(config, messages, "", [], []) as {
      messages: Array<{
        tool_calls: Array<{ function: { arguments: unknown } }>;
      }>;
    };
    expect(body.messages[0].tool_calls[0].function.arguments).toEqual({});
  });

  it("parses valid tool args for Ollama native", () => {
    const config = makeConfig({}, { apiFormat: "ollama_chat" });
    const messages = [
      makeMessage({
        role: "tool_call",
        content: "",
        toolCallId: "t1",
        toolName: "x",
        toolArgs: '{"a":2}',
      }),
    ];
    const body = buildChatCompletionsBody(config, messages, "", [], []) as {
      messages: Array<{
        tool_calls: Array<{ function: { arguments: unknown } }>;
      }>;
    };
    expect(body.messages[0].tool_calls[0].function.arguments).toEqual({ a: 2 });
  });

  it("defaults missing tool args to an empty object string", () => {
    const messages = [
      makeMessage({
        role: "tool_call",
        content: "",
        toolCallId: "t1",
        toolName: "x",
      }),
    ];
    const body = buildChatCompletionsBody(
      makeConfig(),
      messages,
      "",
      [],
      [],
    ) as {
      messages: Array<{
        tool_calls: Array<{ function: { arguments: unknown } }>;
      }>;
    };
    expect(body.messages[0].tool_calls[0].function.arguments).toBe("{}");
  });

  it("adds Ollama think=false only for ollama_chat", () => {
    expect(
      buildChatCompletionsBody(
        makeConfig({}, { apiFormat: "ollama_chat" }),
        [],
        "",
        [],
        [],
      ),
    ).toHaveProperty("think", false);
    expect(
      buildChatCompletionsBody(makeConfig(), [], "", [], []),
    ).not.toHaveProperty("think");
  });

  it("registers skill and enabled MCP tools", () => {
    const body = buildChatCompletionsBody(
      makeConfig(),
      [],
      "",
      skill,
      mcpTools,
    ) as {
      tools: Array<{ function: { name: string } }>;
      tool_choice: string;
    };
    expect(body.tools.map((t) => t.function.name)).toEqual([
      "get_skill_details",
      "on",
    ]);
    expect(body.tool_choice).toBe("auto");
  });

  it("omits tools when none are available", () => {
    expect(
      buildChatCompletionsBody(makeConfig(), [], "", [], []),
    ).not.toHaveProperty("tools");
  });

  it("applies a valid JSON schema and ignores an invalid one", () => {
    const valid = buildChatCompletionsBody(
      makeConfig({ jsonSchema: '{"type":"object"}' }),
      [],
      "",
      [],
      [],
    ) as Record<string, unknown>;
    expect(valid.response_format).toEqual({
      type: "json_schema",
      json_schema: { type: "object" },
    });
    const invalid = buildChatCompletionsBody(
      makeConfig({ jsonSchema: "{bad" }),
      [],
      "",
      [],
      [],
    ) as Record<string, unknown>;
    expect(invalid).not.toHaveProperty("response_format");
  });
});
