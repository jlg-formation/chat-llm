import type { AppConfig, ChatMessage, McpTool } from "../../types";
import type { SkillRef } from "./types";
import {
  usesResponsesAPI,
  usesAnthropicNative,
  isAnthropic,
  isMistral,
} from "./helpers";
import { safeParseArgs } from "./parsers";
import {
  buildAnthropicBody,
  ANTHROPIC_DEFAULT_MAX_TOKENS,
} from "./bodyBuildersAnthropic";
import {
  skillToolForChatCompletions,
  skillToolForResponsesAPI,
  mcpToolForChatCompletions,
  mcpToolForResponsesAPI,
  buildTools,
  parseJsonSchema,
} from "./tools";

// Les noms de champs diffèrent selon le format pour la limite de tokens.
function applySampling(
  body: Record<string, unknown>,
  config: AppConfig,
  maxTokensField: string,
) {
  // Anthropic : temperature/top_p jamais envoyés, max_tokens toujours présent
  if (isAnthropic(config)) {
    body[maxTokensField] = config.llm.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS;
    return;
  }
  if (config.llm.temperature !== null)
    body.temperature = config.llm.temperature;
  if (config.llm.topP !== null) body.top_p = config.llm.topP;
  if (config.llm.maxTokens !== null)
    body[maxTokensField] = config.llm.maxTokens;
}

export function buildChatCompletionsBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: SkillRef[],
  mcpTools: McpTool[],
) {
  const msgs: unknown[] = [];

  if (systemPrompt) msgs.push({ role: "system", content: systemPrompt });

  for (const m of messages) {
    if (m.isError) continue;
    if (m.role === "assistant") {
      msgs.push({ role: "assistant", content: m.content });
    } else if (m.role === "user") {
      if (m.images && m.images.length > 0) {
        const parts: unknown[] = [{ type: "text", text: m.content }];
        for (const img of m.images)
          parts.push({ type: "image_url", image_url: { url: img.dataUrl } });
        msgs.push({ role: "user", content: parts });
      } else {
        msgs.push({ role: "user", content: m.content });
      }
    } else if (m.role === "tool_call") {
      const isOllamaNative = config.llm.apiFormat === "ollama_chat";
      const rawArgs = m.toolArgs ?? "{}";
      const argsValue = isOllamaNative ? safeParseArgs(rawArgs) : rawArgs;
      msgs.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: m.toolCallId,
            type: "function",
            function: { name: m.toolName, arguments: argsValue },
          },
        ],
      });
    } else if (m.role === "tool_result") {
      msgs.push({
        role: "tool",
        tool_call_id: m.toolCallResultId,
        content: m.content,
      });
    }
  }

  const body: Record<string, unknown> = {
    model: config.llm.model,
    messages: msgs,
    stream: config.streamEnabled,
  };

  // Mistral rejette les champs inconnus : pas de stream_options, usage dans le dernier chunk
  if (config.streamEnabled && !isMistral(config)) {
    body.stream_options = { include_usage: true };
  }

  if (config.llm.apiFormat === "ollama_chat") body.think = false;

  applySampling(
    body,
    config,
    isMistral(config) ? "max_tokens" : "max_completion_tokens",
  );

  const allTools = buildTools(
    skillRefs,
    mcpTools,
    skillToolForChatCompletions,
    mcpToolForChatCompletions,
  );
  if (allTools.length > 0) {
    body.tools = allTools;
    body.tool_choice = "auto";
  }

  const schema = parseJsonSchema(config);
  if (schema !== undefined) {
    // Anthropic (mode compatible) n'accepte que json_schema avec strict: true
    const jsonSchema = isAnthropic(config)
      ? { ...(schema as Record<string, unknown>), strict: true }
      : schema;
    body.response_format = { type: "json_schema", json_schema: jsonSchema };
  }

  return body;
}

export function buildOpenAIResponsesBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: SkillRef[],
  mcpTools: McpTool[],
) {
  const input: unknown[] = [];

  for (const m of messages) {
    if (m.isError) continue;
    if (m.role === "assistant") {
      input.push({ type: "message", role: "assistant", content: m.content });
    } else if (m.role === "user") {
      const contentParts: unknown[] = [];
      if (m.content) contentParts.push({ type: "input_text", text: m.content });
      if (m.images) {
        for (const img of m.images)
          contentParts.push({ type: "input_image", image_url: img.dataUrl });
      }
      input.push({ type: "message", role: "user", content: contentParts });
    } else if (m.role === "tool_call") {
      input.push({
        type: "function_call",
        call_id: m.toolCallId,
        name: m.toolName,
        arguments: m.toolArgs ?? "{}",
      });
    } else if (m.role === "tool_result") {
      input.push({
        type: "function_call_output",
        call_id: m.toolCallResultId,
        output: m.content,
      });
    }
  }

  const body: Record<string, unknown> = {
    model: config.llm.model,
    input,
    stream: config.streamEnabled,
    store: false,
  };

  if (systemPrompt) body.instructions = systemPrompt;

  applySampling(body, config, "max_output_tokens");

  const allTools = buildTools(
    skillRefs,
    mcpTools,
    skillToolForResponsesAPI,
    mcpToolForResponsesAPI,
  );
  if (allTools.length > 0) body.tools = allTools;

  const schema = parseJsonSchema(config);
  if (schema !== undefined)
    body.text = {
      format: { type: "json_schema", name: "output", strict: false, schema },
    };

  return body;
}

export function buildLmStudioChatBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  previousResponseId?: string,
) {
  // Trouver le dernier message utilisateur (le tour courant)
  const lastUserMsg = [...messages]
    .reverse()
    .find((m) => m.role === "user" && !m.isError);

  // input = liste d'items {type:"text"|"image"} du tour courant uniquement
  const input: unknown[] = [];
  if (lastUserMsg) {
    if (lastUserMsg.content)
      input.push({ type: "text", content: lastUserMsg.content });
    for (const img of lastUserMsg.images ?? [])
      input.push({ type: "image", data_url: img.dataUrl });
  }

  const body: Record<string, unknown> = {
    model: config.llm.model,
    input,
    stream: config.streamEnabled,
    store: true,
  };

  if (previousResponseId) body.previous_response_id = previousResponseId;
  if (systemPrompt) body.system_prompt = systemPrompt;
  applySampling(body, config, "max_output_tokens");

  // Intégration MCP via ephemeral_mcp (format natif LM Studio) — un plugin par serveur actif
  const enabledServers = config.mcpServers.filter((s) => s.enabled && s.url);
  if (enabledServers.length > 0) {
    body.integrations = enabledServers.map((server) => {
      const enabledTools = server.tools.filter((t) => t.enabled);
      const integration: Record<string, unknown> = {
        type: "plugin",
        id: `mcp/${server.name || server.id}`,
      };
      if (enabledTools.length > 0)
        integration.allowed_tools = enabledTools.map((t) => t.name);
      return integration;
    });
  }

  return body;
}

export function buildBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: SkillRef[],
  mcpTools: McpTool[],
  options?: { previousResponseId?: string },
) {
  if (config.llm.apiFormat === "lmstudio_chat") {
    return buildLmStudioChatBody(
      config,
      messages,
      systemPrompt,
      options?.previousResponseId,
    );
  }
  if (usesAnthropicNative(config)) {
    return buildAnthropicBody(
      config,
      messages,
      systemPrompt,
      skillRefs,
      mcpTools,
    );
  }
  return usesResponsesAPI(config)
    ? buildOpenAIResponsesBody(
        config,
        messages,
        systemPrompt,
        skillRefs,
        mcpTools,
      )
    : buildChatCompletionsBody(
        config,
        messages,
        systemPrompt,
        skillRefs,
        mcpTools,
      );
}
