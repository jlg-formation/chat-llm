import type { LLMToolCall } from "./types";
import type { HostedActivity, TokenUsage, WebSource } from "../../types";
import { parseSSEEvents } from "../sse";
import { collectGeneratedImages } from "./parsersImages";

/** Payloads `data:` d'un flux SSE, jusqu'au sentinel `[DONE]`. */
export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<string> {
  for await (const { data } of parseSSEEvents(response.body!)) {
    if (data === "[DONE]") return;
    yield data;
  }
}

export function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

export function toolCall(
  id: string,
  name: string,
  rawArgs: string,
): LLMToolCall {
  return { id, name, rawArgs, args: safeParseArgs(rawArgs) };
}

// Responses API : input/output_tokens ; Chat Completions : prompt/completion_tokens.
// Tokens image facturés à part dans tool_usage.image_gen.
export function extractUsage(
  obj: Record<string, unknown>,
): TokenUsage | undefined {
  const u = obj.usage as Record<string, unknown> | undefined;
  if (!u) return undefined;
  const toolUsage = obj.tool_usage as Record<string, unknown> | undefined;
  const imageGen = toolUsage?.image_gen as Record<string, unknown> | undefined;
  const details = imageGen?.output_tokens_details as
    | Record<string, unknown>
    | undefined;
  const imageOutputTokens =
    typeof details?.image_tokens === "number"
      ? details.image_tokens
      : undefined;
  const imageInputTokens =
    typeof imageGen?.input_tokens === "number"
      ? imageGen.input_tokens
      : undefined;
  return {
    promptTokens:
      (u.input_tokens as number) ?? (u.prompt_tokens as number) ?? 0,
    completionTokens:
      (u.output_tokens as number) ?? (u.completion_tokens as number) ?? 0,
    ...(imageInputTokens !== undefined ? { imageInputTokens } : {}),
    ...(imageOutputTokens !== undefined ? { imageOutputTokens } : {}),
  };
}

// Recherche web hébergée : requêtes (web_search_call) et sources (url_citation) d'une réponse
export function collectHosted(
  output: unknown[] | undefined,
): HostedActivity | undefined {
  const searches: string[] = [];
  const sources: WebSource[] = [];
  for (const item of output ?? []) {
    const it = item as Record<string, unknown>;
    if (it.type === "web_search_call") {
      const query = (it.action as Record<string, unknown> | undefined)?.query;
      if (typeof query === "string") searches.push(query);
    } else if (it.type === "message") {
      for (const part of (it.content as unknown[]) ?? []) {
        for (const ann of ((part as Record<string, unknown>)
          .annotations as unknown[]) ?? []) {
          const a = ann as Record<string, unknown>;
          if (a.type === "url_citation" && typeof a.url === "string")
            sources.push({ url: a.url, title: a.title as string | undefined });
        }
      }
    }
  }
  const images = collectGeneratedImages(output);
  return searches.length > 0 || sources.length > 0 || images.length > 0
    ? { searches, sources, images }
    : undefined;
}

export function withHosted(hosted: HostedActivity | undefined) {
  return hosted ? { hosted } : {};
}

export function withThinking(thinking: string) {
  return thinking ? { thinking } : {};
}
