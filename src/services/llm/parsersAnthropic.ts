import type { LLMResult, LLMToolCall } from "./types";
import type { HostedActivity, TokenUsage, WebSource } from "../../types";
import { parseSSEEvents } from "../sse";

type Block = Record<string, unknown>;

function usageOf(
  u: Record<string, unknown> | undefined,
): TokenUsage | undefined {
  if (!u) return undefined;
  return {
    promptTokens: (u.input_tokens as number) ?? 0,
    completionTokens: (u.output_tokens as number) ?? 0,
  };
}

// Blocs rejoués tels quels au tour suivant (web_search côté serveur inclus)
const REPLAYED_TYPES = [
  "thinking",
  "redacted_thinking",
  "server_tool_use",
  "web_search_tool_result",
];

// Requêtes et sources de la recherche web hébergée
function collectHosted(blocks: Block[]): HostedActivity | undefined {
  const searches: string[] = [];
  const sources: WebSource[] = [];
  for (const b of blocks) {
    if (b.type === "server_tool_use" && b.name === "web_search") {
      const query = (b.input as Record<string, unknown> | undefined)?.query;
      if (typeof query === "string") searches.push(query);
    } else if (
      b.type === "web_search_tool_result" &&
      Array.isArray(b.content)
    ) {
      for (const r of b.content as Block[]) {
        if (r.type === "web_search_result" && typeof r.url === "string")
          sources.push({ url: r.url, title: r.title as string | undefined });
      }
    }
  }
  return searches.length > 0 || sources.length > 0
    ? { searches, sources, images: [] }
    : undefined;
}

// Commun au streaming (blocs assemblés) et au non-streaming (content de la réponse).
function resultFromBlocks(
  blocks: Block[],
  usage?: TokenUsage,
  stopReason?: string,
): LLMResult {
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => (b.text as string) ?? "")
    .join("");
  const thinking = blocks
    .filter((b) => b.type === "thinking")
    .map((b) => (b.thinking as string) ?? "")
    .join("");
  const thinkingBlocks = blocks.filter((b) =>
    REPLAYED_TYPES.includes(b.type as string),
  );
  const calls: LLMToolCall[] = blocks
    .filter((b) => b.type === "tool_use")
    .map((b) => {
      const args = (b.input as Record<string, unknown>) ?? {};
      return {
        id: b.id as string,
        name: b.name as string,
        args,
        rawArgs: JSON.stringify(args),
      };
    });

  const hosted = collectHosted(blocks);
  if (calls.length > 0) {
    return {
      type: "tool_calls",
      calls,
      usage,
      thinking: thinking || undefined,
      thinkingBlocks,
      hosted,
    };
  }
  return {
    type: "text",
    content: text,
    usage,
    thinking: thinking || undefined,
    hosted,
    // pause_turn : la réponse doit être renvoyée telle quelle pour que le serveur reprenne
    pausedContent: stopReason === "pause_turn" ? blocks : undefined,
  };
}

export async function streamAnthropicMessages(
  response: Response,
  onToken: (t: string) => void,
  onThinking?: (t: string) => void,
): Promise<LLMResult> {
  const blocks: Block[] = [];
  const toolJson = new Map<number, string>();
  let inputTokens = 0;
  let outputTokens = 0;
  let hasUsage = false;
  let stopReason: string | undefined;

  for await (const { data } of parseSSEEvents(response.body!)) {
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(data) as Record<string, unknown>;
    } catch {
      continue; // chunk non-JSON
    }
    const index = json.index as number;

    switch (json.type as string) {
      case "message_start": {
        const u = (json.message as Block | undefined)?.usage as
          | Record<string, unknown>
          | undefined;
        if (u) {
          hasUsage = true;
          inputTokens = (u.input_tokens as number) ?? 0;
          outputTokens = (u.output_tokens as number) ?? 0;
        }
        break;
      }
      case "content_block_start":
        blocks[index] = { ...(json.content_block as Block) };
        if (
          blocks[index].type === "tool_use" ||
          blocks[index].type === "server_tool_use"
        )
          toolJson.set(index, "");
        break;
      case "content_block_delta": {
        const delta = json.delta as Block;
        const block = blocks[index];
        if (!block) break;
        if (delta.type === "text_delta") {
          block.text = ((block.text as string) ?? "") + delta.text;
          onToken(delta.text as string);
        } else if (delta.type === "thinking_delta") {
          block.thinking = ((block.thinking as string) ?? "") + delta.thinking;
          onThinking?.(delta.thinking as string);
        } else if (delta.type === "signature_delta") {
          block.signature =
            ((block.signature as string) ?? "") + delta.signature;
        } else if (delta.type === "input_json_delta") {
          toolJson.set(index, (toolJson.get(index) ?? "") + delta.partial_json);
        }
        break;
      }
      case "message_delta": {
        stopReason =
          ((json.delta as Block | undefined)?.stop_reason as
            | string
            | undefined) ?? stopReason;
        const u = json.usage as Record<string, unknown> | undefined;
        if (u) {
          hasUsage = true;
          outputTokens = (u.output_tokens as number) ?? outputTokens;
          inputTokens = (u.input_tokens as number) ?? inputTokens;
        }
        break;
      }
      case "error": {
        const err = json.error as Record<string, unknown> | undefined;
        throw new Error((err?.message as string) ?? "Erreur Anthropic");
      }
    }
  }

  for (const [index, raw] of toolJson) {
    try {
      blocks[index].input = raw ? JSON.parse(raw) : {};
    } catch {
      blocks[index].input = {};
    }
  }

  return resultFromBlocks(
    blocks.filter(Boolean),
    hasUsage
      ? { promptTokens: inputTokens, completionTokens: outputTokens }
      : undefined,
    stopReason,
  );
}

export function parseAnthropicNonStreaming(json: unknown): LLMResult {
  const obj = json as Record<string, unknown>;
  return resultFromBlocks(
    (obj.content as Block[]) ?? [],
    usageOf(obj.usage as Record<string, unknown> | undefined),
    obj.stop_reason as string | undefined,
  );
}
