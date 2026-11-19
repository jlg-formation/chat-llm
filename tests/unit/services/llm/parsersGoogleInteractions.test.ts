import { describe, it, expect } from "vitest";
import {
  streamGoogleInteractions,
  parseGoogleInteractionsNonStreaming,
} from "@/services/llm/parsersGoogleInteractions";
import { sseResponse } from "../../fixtures";

const event = (name: string, data: unknown) =>
  `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

describe("streamGoogleInteractions", () => {
  it("streams text deltas and reads completion usage", async () => {
    const tokens: string[] = [];
    const res = sseResponse([
      event("step.delta", {
        event_type: "step.delta",
        index: 0,
        delta: { type: "text", text: "Sa" },
      }),
      event("step.delta", {
        event_type: "step.delta",
        index: 0,
        delta: { type: "text", text: "lut" },
      }),
      event("interaction.completed", {
        event_type: "interaction.completed",
        interaction: {
          id: "int-1",
          usage: {
            total_input_tokens: 10,
            total_output_tokens: 2,
            total_thought_tokens: 1,
          },
        },
      }),
    ]);
    const result = await streamGoogleInteractions(res, (t) => tokens.push(t));
    expect(tokens).toEqual(["Sa", "lut"]);
    expect(result).toEqual({
      type: "text",
      content: "Salut",
      responseId: "int-1",
      usage: { promptTokens: 10, completionTokens: 3 },
    });
  });

  it("accumulates function_call arguments into a tool_calls result", async () => {
    const res = sseResponse([
      event("step.start", {
        event_type: "step.start",
        index: 0,
        step: { type: "function_call", id: "call-1", name: "add" },
      }),
      event("step.delta", {
        event_type: "step.delta",
        index: 0,
        delta: { type: "arguments_delta", arguments_delta: '{"a":' },
      }),
      event("step.delta", {
        event_type: "step.delta",
        index: 0,
        delta: { type: "arguments_delta", arguments_delta: '2,"b":3}' },
      }),
      event("step.stop", { event_type: "step.stop", index: 0 }),
      event("interaction.completed", {
        event_type: "interaction.completed",
        interaction: { id: "int-2" },
      }),
    ]);
    const result = await streamGoogleInteractions(res, () => {});
    expect(result).toEqual({
      type: "tool_calls",
      calls: [
        {
          id: "call-1",
          name: "add",
          rawArgs: '{"a":2,"b":3}',
          args: { a: 2, b: 3 },
        },
      ],
      responseId: "int-2",
      usage: undefined,
    });
  });

  it("emits thought summaries through onThinking", async () => {
    const thoughts: string[] = [];
    const res = sseResponse([
      event("step.delta", {
        event_type: "step.delta",
        index: 0,
        delta: {
          type: "thought_summary",
          content: { type: "text", text: "Réflexion" },
        },
      }),
      event("interaction.completed", {
        event_type: "interaction.completed",
        interaction: { id: "x" },
      }),
    ]);
    const result = await streamGoogleInteractions(
      res,
      () => {},
      (t) => thoughts.push(t),
    );
    expect(thoughts).toEqual(["Réflexion"]);
    expect(result.type).toBe("text");
  });

  it("falls back to completed steps when no call was streamed", async () => {
    const res = sseResponse([
      event("interaction.completed", {
        event_type: "interaction.completed",
        interaction: {
          id: "int-3",
          steps: [
            {
              type: "function_call",
              id: "c9",
              name: "echo",
              arguments: { text: "hi" },
            },
          ],
        },
      }),
    ]);
    const result = await streamGoogleInteractions(res, () => {});
    expect(result).toEqual({
      type: "tool_calls",
      calls: [
        {
          id: "c9",
          name: "echo",
          rawArgs: '{"text":"hi"}',
          args: { text: "hi" },
        },
      ],
      responseId: "int-3",
      usage: undefined,
    });
  });
});

describe("parseGoogleInteractionsNonStreaming", () => {
  it("reads model_output text, thoughts and usage", () => {
    const result = parseGoogleInteractionsNonStreaming({
      id: "n-1",
      steps: [
        { type: "thought", summary: [{ type: "text", text: "pensée" }] },
        {
          type: "model_output",
          content: [
            { type: "text", text: "Bon" },
            { type: "text", text: "jour" },
          ],
        },
      ],
      usage: {
        total_input_tokens: 4,
        total_output_tokens: 5,
        total_thought_tokens: 0,
      },
    });
    expect(result).toEqual({
      type: "text",
      content: "Bonjour",
      responseId: "n-1",
      usage: { promptTokens: 4, completionTokens: 5 },
      thinking: "pensée",
    });
  });

  it("returns tool_calls when function_call steps are present", () => {
    const result = parseGoogleInteractionsNonStreaming({
      id: "n-2",
      steps: [{ type: "function_call", id: "k", name: "time", arguments: {} }],
    });
    expect(result).toEqual({
      type: "tool_calls",
      calls: [{ id: "k", name: "time", rawArgs: "{}", args: {} }],
      responseId: "n-2",
      usage: undefined,
    });
  });
});
