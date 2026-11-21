import type { AppConfig, ChatMessage, McpTool } from '../../types'
import type { SkillRef } from './types'
import { buildGoogleInteractionsBody } from './bodyBuildersGoogleInteractions'
import {
  usesResponsesAPI,
  usesAnthropicNative,
  usesGoogleInteractions,
  isAnthropic,
  isMistral,
  isGoogle,
  webSearchActive,
  imageGenerationActive,
} from './helpers'
import { safeParseArgs } from './parsers'
import { getReasoningEfforts, resolveReasoningEffort } from './reasoningCapabilities'
import { buildAnthropicBody } from './bodyBuildersAnthropic'
import { applySampling } from './bodyBuildersSampling'
import { buildLmStudioChatBody } from './bodyBuildersLmStudio'
import {
  skillToolForChatCompletions,
  skillToolForResponsesAPI,
  mcpToolForChatCompletions,
  mcpToolForResponsesAPI,
  buildTools,
  parseJsonSchema,
} from './tools'
import { subAgentTools } from '../subAgents'

export { buildLmStudioChatBody }

export function buildChatCompletionsBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: SkillRef[],
  mcpTools: McpTool[],
) {
  const msgs: unknown[] = []

  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })

  for (const m of messages) {
    if (m.isError) continue
    if (m.role === 'assistant') {
      msgs.push({ role: 'assistant', content: m.content })
    } else if (m.role === 'user') {
      if (m.images && m.images.length > 0) {
        const parts: unknown[] = [{ type: 'text', text: m.content }]
        for (const img of m.images)
          parts.push({ type: 'image_url', image_url: { url: img.dataUrl } })
        msgs.push({ role: 'user', content: parts })
      } else {
        msgs.push({ role: 'user', content: m.content })
      }
    } else if (m.role === 'tool_call') {
      const isOllamaNative = config.llm.apiFormat === 'ollama_chat'
      const rawArgs = m.toolArgs ?? '{}'
      const argsValue = isOllamaNative ? safeParseArgs(rawArgs) : rawArgs
      msgs.push({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: m.toolCallId,
            type: 'function',
            function: { name: m.toolName, arguments: argsValue },
          },
        ],
      })
    } else if (m.role === 'tool_result') {
      msgs.push({
        role: 'tool',
        tool_call_id: m.toolCallResultId,
        content: m.content,
      })
    }
  }

  const body: Record<string, unknown> = {
    model: config.llm.model,
    messages: msgs,
    stream: config.streamEnabled,
  }

  // Mistral rejette les champs inconnus : pas de stream_options, usage dans le dernier chunk
  if (config.streamEnabled && !isMistral(config)) {
    body.stream_options = { include_usage: true }
  }

  if (config.llm.apiFormat === 'ollama_chat') body.think = false

  applySampling(
    body,
    config,
    isMistral(config) || isGoogle(config) ? 'max_tokens' : 'max_completion_tokens',
  )

  const allTools = [
    ...buildTools(skillRefs, mcpTools, skillToolForChatCompletions, mcpToolForChatCompletions),
    ...subAgentTools(config, 'chat_completions'),
  ]
  if (allTools.length > 0) {
    body.tools = allTools
    body.tool_choice = 'auto'
  }

  const schema = parseJsonSchema(config)
  if (schema !== undefined) {
    // Anthropic (mode compatible) n'accepte que json_schema avec strict: true
    const jsonSchema = isAnthropic(config)
      ? { ...(schema as Record<string, unknown>), strict: true }
      : schema
    body.response_format = { type: 'json_schema', json_schema: jsonSchema }
  }

  return body
}

export function buildOpenAIResponsesBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: SkillRef[],
  mcpTools: McpTool[],
) {
  const input: unknown[] = []

  for (const m of messages) {
    if (m.isError) continue
    if (m.role === 'assistant') {
      input.push({ type: 'message', role: 'assistant', content: m.content })
    } else if (m.role === 'user') {
      const contentParts: unknown[] = []
      if (m.content) contentParts.push({ type: 'input_text', text: m.content })
      if (m.images) {
        for (const img of m.images)
          contentParts.push({ type: 'input_image', image_url: img.dataUrl })
      }
      input.push({ type: 'message', role: 'user', content: contentParts })
    } else if (m.role === 'tool_call') {
      input.push({
        type: 'function_call',
        call_id: m.toolCallId,
        name: m.toolName,
        arguments: m.toolArgs ?? '{}',
      })
    } else if (m.role === 'tool_result') {
      input.push({
        type: 'function_call_output',
        call_id: m.toolCallResultId,
        output: m.content,
      })
    }
  }

  const body: Record<string, unknown> = {
    model: config.llm.model,
    input,
    stream: config.streamEnabled,
    store: false,
  }

  if (systemPrompt) body.instructions = systemPrompt

  // Résumé du raisonnement : envoyé pour les modèles de la table de capacités
  const reasoningLevels = getReasoningEfforts(config.llm.model)
  let reasoningActive = false
  if (reasoningLevels) {
    const effort = resolveReasoningEffort(config)
    body.reasoning = effort ? { effort, summary: 'auto' } : { summary: 'auto' }
    reasoningActive = effort !== 'none'
  }

  applySampling(body, config, 'max_output_tokens', reasoningActive)

  const hostedTools: Record<string, unknown>[] = []
  if (webSearchActive(config)) hostedTools.push({ type: 'web_search' })
  if (imageGenerationActive(config))
    hostedTools.push({
      type: 'image_generation',
      model: config.hostedTools.imageModel,
      quality: 'low',
      size: config.hostedTools.imageSize,
    })
  const allTools = [
    ...buildTools(skillRefs, mcpTools, skillToolForResponsesAPI, mcpToolForResponsesAPI),
    ...subAgentTools(config, 'responses'),
    ...hostedTools,
  ]
  if (allTools.length > 0) body.tools = allTools

  const schema = parseJsonSchema(config)
  if (schema !== undefined)
    body.text = {
      format: { type: 'json_schema', name: 'output', strict: false, schema },
    }

  return body
}

export function buildBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: SkillRef[],
  mcpTools: McpTool[],
  options?: { previousResponseId?: string },
) {
  if (config.llm.apiFormat === 'lmstudio_chat') {
    return buildLmStudioChatBody(config, messages, systemPrompt, options?.previousResponseId)
  }
  if (usesGoogleInteractions(config)) {
    return buildGoogleInteractionsBody(
      config,
      messages,
      systemPrompt,
      skillRefs,
      mcpTools,
      options?.previousResponseId,
    )
  }
  if (usesAnthropicNative(config)) {
    return buildAnthropicBody(config, messages, systemPrompt, skillRefs, mcpTools)
  }
  return usesResponsesAPI(config)
    ? buildOpenAIResponsesBody(config, messages, systemPrompt, skillRefs, mcpTools)
    : buildChatCompletionsBody(config, messages, systemPrompt, skillRefs, mcpTools)
}
