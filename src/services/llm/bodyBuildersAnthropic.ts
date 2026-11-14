import type {
  AppConfig,
  ChatMessage,
  McpTool,
  MessageImage,
} from "../../types";
import type { SkillRef } from "./types";
import { safeParseArgs } from "./parsers";
import {
  skillToolForAnthropic,
  mcpToolForAnthropic,
  buildTools,
  parseJsonSchema,
} from "./tools";

/** Anthropic impose max_tokens ; valeur utilisée quand l'utilisateur n'en fixe pas. */
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 4096;

function imageBlock(img: MessageImage) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(img.dataUrl);
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: m?.[1] ?? img.mimeType,
      data: m?.[2] ?? "",
    },
  };
}

// Tous les appels d'une itération → 1 message assistant, tous les résultats → 1 message user.
function toolTurnMessages(group: ChatMessage[]): unknown[] {
  const calls = group.filter((m) => m.role === "tool_call");
  const results = group.filter((m) => m.role === "tool_result");
  return [
    {
      role: "assistant",
      content: [
        ...calls.flatMap((c) => c.thinkingBlocks ?? []),
        ...calls.map((c) => ({
          type: "tool_use",
          id: c.toolCallId,
          name: c.toolName,
          input: safeParseArgs(c.toolArgs ?? "{}"),
        })),
      ],
    },
    {
      role: "user",
      content: results.map((r) => ({
        type: "tool_result",
        tool_use_id: r.toolCallResultId,
        content: r.content,
      })),
    },
  ];
}

function buildMessages(messages: ChatMessage[]): unknown[] {
  const out: unknown[] = [];
  const visible = messages.filter((m) => !m.isError);

  for (let i = 0; i < visible.length; i++) {
    const m = visible[i];
    if (m.role === "tool_call" || m.role === "tool_result") {
      const turnId = m.toolTurnId;
      const group: ChatMessage[] = [m];
      while (
        i + 1 < visible.length &&
        (visible[i + 1].role === "tool_call" ||
          visible[i + 1].role === "tool_result") &&
        visible[i + 1].toolTurnId === turnId
      ) {
        group.push(visible[++i]);
      }
      out.push(...toolTurnMessages(group));
    } else if (m.role === "user") {
      const content: unknown[] = (m.images ?? []).map(imageBlock);
      if (m.content) content.push({ type: "text", text: m.content });
      out.push({ role: "user", content });
    } else if (m.role === "assistant" && m.content) {
      out.push({ role: "assistant", content: m.content });
    }
  }
  return out;
}

export function buildAnthropicBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: SkillRef[],
  mcpTools: McpTool[],
) {
  const body: Record<string, unknown> = {
    model: config.llm.model,
    max_tokens: config.llm.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
    stream: config.streamEnabled,
    messages: buildMessages(messages),
    // Réflexion adaptative : non désactivable, seul l'affichage se règle
    thinking: {
      type: "adaptive",
      display: config.llm.showThinking ? "summarized" : "omitted",
    },
  };

  if (systemPrompt) body.system = systemPrompt;

  const tools = buildTools(
    skillRefs,
    mcpTools,
    skillToolForAnthropic,
    mcpToolForAnthropic,
  );
  if (tools.length > 0) {
    body.tools = tools;
    // Opus/Sonnet/Fable 5.x rejettent tool_choice forcé
    body.tool_choice = { type: "auto" };
  }

  const schema = parseJsonSchema(config) as Record<string, unknown> | null;
  if (schema) {
    // L'éditeur attend { name, schema } ; l'API veut le schéma seul
    const inner = (schema.schema as unknown) ?? schema;
    body.output_config = { format: { type: "json_schema", schema: inner } };
  }

  return body;
}
