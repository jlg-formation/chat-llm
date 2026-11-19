import type { AppConfig, ChatMessage, McpTool } from "../../types";
import type { SkillRef } from "./types";
import {
  getReasoningEfforts,
  resolveGoogleThinkingLevel,
} from "./reasoningCapabilities";
import {
  buildTools,
  parseJsonSchema,
  skillToolForInteractions,
  mcpToolForInteractions,
} from "./tools";

type Item = Record<string, unknown>;

// data URL → contenu image ; sinon référence par URI
function imageContent(dataUrl: string): Item {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return { type: "image", uri: dataUrl };
  return { type: "image", data: m[2], mime_type: m[1] };
}

/**
 * Entrée du tour courant uniquement (l'historique est porté par previous_interaction_id) :
 * - après des tool_result : une liste de steps function_result ;
 * - sinon : le contenu du dernier message utilisateur (texte + images).
 */
export function buildGoogleInteractionsInput(messages: ChatMessage[]): Item[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && !messages[i].isError) {
      lastUserIdx = i;
      break;
    }
  }
  const tail = messages.slice(lastUserIdx + 1);
  const toolResults = tail.filter((m) => m.role === "tool_result");

  if (toolResults.length > 0) {
    return toolResults.map((r) => {
      const call = tail.find(
        (m) => m.role === "tool_call" && m.toolCallId === r.toolCallResultId,
      );
      return {
        type: "function_result",
        name: call?.toolName ?? "",
        call_id: r.toolCallResultId,
        result: [{ type: "text", text: r.content }],
      };
    });
  }

  const last = messages[lastUserIdx];
  if (!last) return [];
  const content: Item[] = [{ type: "text", text: last.content }];
  for (const img of last.images ?? []) content.push(imageContent(img.dataUrl));
  return content;
}

export function buildGoogleInteractionsBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: SkillRef[],
  mcpTools: McpTool[],
  previousInteractionId?: string,
) {
  const body: Record<string, unknown> = {
    model: config.llm.model,
    input: buildGoogleInteractionsInput(messages),
    stream: config.streamEnabled,
    // Requis pour pouvoir chaîner avec previous_interaction_id
    store: true,
  };

  if (previousInteractionId)
    body.previous_interaction_id = previousInteractionId;
  if (systemPrompt) body.system_instruction = systemPrompt;

  // Pas de paramètres de sampling pour les modèles qui les refusent : seuls les champs renseignés sont envoyés
  const generation: Record<string, unknown> = {};
  if (config.llm.temperature !== null)
    generation.temperature = config.llm.temperature;
  if (config.llm.topP !== null) generation.top_p = config.llm.topP;
  if (config.llm.maxTokens !== null)
    generation.max_output_tokens = config.llm.maxTokens;
  // Réflexion : seuls les modèles de la table de capacités reçoivent les champs
  if (getReasoningEfforts(config.llm.model)) {
    const level = resolveGoogleThinkingLevel(config);
    if (level) generation.thinking_level = level;
    generation.thinking_summaries = config.llm.showThinking ? "auto" : "none";
  }
  if (Object.keys(generation).length > 0) body.generation_config = generation;

  const tools = buildTools(
    skillRefs,
    mcpTools,
    skillToolForInteractions,
    mcpToolForInteractions,
  );
  if (tools.length > 0) body.tools = tools;

  const schema = parseJsonSchema(config);
  if (schema !== undefined)
    body.response_format = {
      type: "text",
      mime_type: "application/json",
      schema,
    };

  return body;
}
