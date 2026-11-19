import type { LLMResult, LLMToolCall } from "./types";
import type { TokenUsage } from "../../types";
import { parseSSEEvents } from "../sse";
import { toolCall, withThinking } from "./parsersShared";

type Item = Record<string, unknown>;

// Texte d'un champ pouvant être une chaîne ou un Content { type, text }
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const t = (value as Item).text;
    if (typeof t === "string") return t;
  }
  return "";
}

function usageOf(obj: Item | undefined): TokenUsage | undefined {
  const u = obj?.usage as Item | undefined;
  if (!u) return undefined;
  return {
    promptTokens: (u.total_input_tokens as number) ?? 0,
    // Les tokens de réflexion sont facturés comme sortie
    completionTokens:
      ((u.total_output_tokens as number) ?? 0) +
      ((u.total_thought_tokens as number) ?? 0),
  };
}

interface ParsedSteps {
  text: string;
  thinking: string;
  calls: LLMToolCall[];
}

// Extrait texte, réflexion et appels de fonction d'une liste de steps
export function parseInteractionSteps(steps: unknown): ParsedSteps {
  let text = "";
  let thinking = "";
  const calls: LLMToolCall[] = [];
  for (const s of (steps as unknown[]) ?? []) {
    const step = s as Item;
    if (step.type === "model_output") {
      for (const c of (step.content as unknown[]) ?? []) text += textOf(c);
    } else if (step.type === "thought") {
      for (const c of (step.summary as unknown[]) ?? []) thinking += textOf(c);
    } else if (step.type === "function_call") {
      const args = step.arguments;
      const rawArgs =
        typeof args === "string" ? args : JSON.stringify(args ?? {});
      calls.push(toolCall(step.id as string, step.name as string, rawArgs));
    }
  }
  return { text, thinking, calls };
}

interface PendingStep {
  type: string;
  id: string;
  name: string;
  args: string;
  initialArgs?: unknown;
}

export async function streamGoogleInteractions(
  response: Response,
  onToken: (t: string) => void,
  onThinking?: (t: string) => void,
): Promise<LLMResult> {
  let fullText = "";
  let fullThinking = "";
  let responseId: string | undefined;
  let usage: TokenUsage | undefined;
  let completedSteps: unknown;
  const pending = new Map<number, PendingStep>();
  const calls: LLMToolCall[] = [];

  const finalize = (index: number) => {
    const p = pending.get(index);
    if (!p) return;
    pending.delete(index);
    if (p.type !== "function_call") return;
    const raw =
      p.args ||
      (typeof p.initialArgs === "string"
        ? p.initialArgs
        : JSON.stringify(p.initialArgs ?? {}));
    calls.push(toolCall(p.id, p.name, raw));
  };

  for await (const { event, data } of parseSSEEvents(response.body!)) {
    if (data === "[DONE]") break;
    let json: Item;
    try {
      json = JSON.parse(data) as Item;
    } catch {
      continue;
    }
    const type = (json.event_type as string) ?? event;
    const index = json.index as number;

    switch (type) {
      case "interaction.created":
      case "interaction.completed":
      case "interaction.status_update": {
        const inter = (json.interaction ?? json) as Item;
        if (typeof inter.id === "string") responseId = inter.id;
        usage = usageOf(inter) ?? usage;
        if (type === "interaction.completed")
          completedSteps = inter.steps ?? completedSteps;
        break;
      }
      case "step.start": {
        const step = (json.step ?? {}) as Item;
        pending.set(index, {
          type: (step.type as string) ?? "",
          id: (step.id as string) ?? "",
          name: (step.name as string) ?? "",
          args: "",
          initialArgs: step.arguments,
        });
        break;
      }
      case "step.delta": {
        const delta = (json.delta ?? {}) as Item;
        const p = pending.get(index);
        if (delta.type === "text") {
          const t = textOf(delta.text ?? delta.content);
          if (t) {
            fullText += t;
            onToken(t);
          }
        } else if (delta.type === "thought_summary") {
          const t = textOf(delta.content ?? delta.text);
          if (t) {
            fullThinking += t;
            onThinking?.(t);
          }
        } else if (delta.type === "arguments_delta" && p) {
          const piece =
            typeof delta.arguments_delta === "string"
              ? delta.arguments_delta
              : typeof delta.partial_json === "string"
                ? delta.partial_json
                : "";
          p.args += piece;
        }
        break;
      }
      case "step.stop":
        finalize(index);
        break;
    }
  }

  // Steps non clos (flux interrompu) puis repli sur les steps du résultat final
  for (const index of [...pending.keys()]) finalize(index);
  if (calls.length === 0 && completedSteps) {
    calls.push(...parseInteractionSteps(completedSteps).calls);
  }

  if (calls.length > 0) {
    return {
      type: "tool_calls",
      calls,
      responseId,
      usage,
      ...withThinking(fullThinking),
    };
  }
  return {
    type: "text",
    content: fullText,
    responseId,
    usage,
    ...withThinking(fullThinking),
  };
}

export function parseGoogleInteractionsNonStreaming(json: unknown): LLMResult {
  const obj = json as Item;
  const parsed = parseInteractionSteps(obj.steps);
  const responseId = (obj.id as string) ?? undefined;
  const usage = usageOf(obj);
  if (parsed.calls.length > 0) {
    return {
      type: "tool_calls",
      calls: parsed.calls,
      responseId,
      usage,
      ...withThinking(parsed.thinking),
    };
  }
  return {
    type: "text",
    content: parsed.text,
    responseId,
    usage,
    ...withThinking(parsed.thinking),
  };
}
