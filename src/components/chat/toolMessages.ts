import type { ChatMessage } from "../../types";
import type { LLMToolCall } from "../../services/llm";
import { genId } from "../../services/id";

/** Messages tool_call + tool_result d'une itération de la boucle d'outils. */
export function buildToolMessages(
  toolResults: { call: LLMToolCall; content: string }[],
  thinkingBlocks?: unknown[],
): ChatMessage[] {
  const toolTurnId = genId();
  const msgs: ChatMessage[] = [];
  for (const { call, content } of toolResults) {
    msgs.push({
      id: genId(),
      role: "tool_call",
      content: call.rawArgs,
      toolCallId: call.id,
      toolName: call.name,
      toolArgs: call.rawArgs,
      toolTurnId,
      // Les blocs de réflexion ne sont rejoués qu'une fois par tour
      thinkingBlocks: msgs.length === 0 ? thinkingBlocks : undefined,
    });
    msgs.push({
      id: genId(),
      role: "tool_result",
      content,
      toolCallResultId: call.id,
      toolTurnId,
    });
  }
  return msgs;
}
