import { describe, it, expect } from "vitest";
import { parseNonStreamingResponse } from "@/services/llm/parsers";

describe("parseNonStreamingResponse", () => {
  it("parses a Responses API text answer with usage", () => {
    const json = {
      id: "r1",
      output: [
        { type: "message", content: [{ type: "output_text", text: "Hé" }] },
      ],
      usage: { input_tokens: 1, output_tokens: 2 },
    };
    expect(parseNonStreamingResponse(json, true, false)).toEqual({
      type: "text",
      content: "Hé",
      usage: { promptTokens: 1, completionTokens: 2 },
    });
  });

  it("parses Responses API function calls", () => {
    const json = {
      id: "r2",
      output: [
        {
          type: "function_call",
          call_id: "c",
          name: "f",
          arguments: '{"k":true}',
        },
      ],
    };
    expect(parseNonStreamingResponse(json, true, false)).toEqual({
      type: "tool_calls",
      calls: [{ id: "c", name: "f", rawArgs: '{"k":true}', args: { k: true } }],
      responseId: "r2",
      usage: undefined,
    });
  });

  it("tolerates a Responses payload without output or non-text content", () => {
    expect(parseNonStreamingResponse({ id: "x" }, true, false)).toEqual({
      type: "text",
      content: "",
      usage: undefined,
    });
    const json = {
      output: [{ type: "message", content: [{ type: "refusal" }] }],
    };
    expect(parseNonStreamingResponse(json, true, false)).toEqual({
      type: "text",
      content: "",
      usage: undefined,
    });
  });

  it("parses an Ollama text answer and usage", () => {
    const json = {
      message: { content: "Ok" },
      prompt_eval_count: 4,
      eval_count: 8,
    };
    expect(parseNonStreamingResponse(json, false, true)).toEqual({
      type: "text",
      content: "Ok",
      usage: { promptTokens: 4, completionTokens: 8 },
    });
  });

  it("parses Ollama tool calls with object and string args", () => {
    const json = {
      message: {
        tool_calls: [
          { function: { name: "a", arguments: { z: 1 } } },
          { function: { name: "b", arguments: '{"w":2}' } },
        ],
      },
    };
    expect(parseNonStreamingResponse(json, false, true)).toEqual({
      type: "tool_calls",
      calls: [
        { id: "ollama-tool-0", name: "a", rawArgs: '{"z":1}', args: { z: 1 } },
        { id: "ollama-tool-1", name: "b", rawArgs: '{"w":2}', args: { w: 2 } },
      ],
      usage: undefined,
    });
  });

  it("returns empty Ollama text when message content is absent", () => {
    expect(parseNonStreamingResponse({ message: {} }, false, true)).toEqual({
      type: "text",
      content: "",
      usage: undefined,
    });
  });

  it("handles Ollama tool calls with missing arguments", () => {
    const json = { message: { tool_calls: [{ function: { name: "a" } }] } };
    expect(parseNonStreamingResponse(json, false, true)).toMatchObject({
      type: "tool_calls",
      calls: [{ rawArgs: "{}", args: {} }],
    });
  });

  it("parses Chat Completions tool calls with the raw assistant message", () => {
    const msg = {
      role: "assistant",
      tool_calls: [{ id: "t", function: { name: "f", arguments: "{}" } }],
    };
    const json = { choices: [{ finish_reason: "tool_calls", message: msg }] };
    expect(parseNonStreamingResponse(json, false, false)).toEqual({
      type: "tool_calls",
      calls: [{ id: "t", name: "f", rawArgs: "{}", args: {} }],
      rawAssistantMsg: msg,
      usage: undefined,
    });
  });

  it("parses a Chat Completions text answer with usage", () => {
    const json = {
      choices: [{ finish_reason: "stop", message: { content: "Bye" } }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    };
    expect(parseNonStreamingResponse(json, false, false)).toEqual({
      type: "text",
      content: "Bye",
      usage: { promptTokens: 10, completionTokens: 2 },
    });
  });

  it("returns empty text when a Chat Completions message has no content", () => {
    expect(
      parseNonStreamingResponse({ choices: [{ message: {} }] }, false, false),
    ).toEqual({
      type: "text",
      content: "",
      usage: undefined,
    });
  });
});
