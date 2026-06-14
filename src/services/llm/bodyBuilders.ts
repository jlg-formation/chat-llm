import type { AppConfig, ChatMessage, McpTool } from '../../types'
import type { SkillRef } from './types'
import { usesResponsesAPI } from './helpers'
import { skillToolForChatCompletions, skillToolForResponsesAPI, mcpToolForChatCompletions, mcpToolForResponsesAPI } from './tools'

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
        for (const img of m.images) parts.push({ type: 'image_url', image_url: { url: img.dataUrl } })
        msgs.push({ role: 'user', content: parts })
      } else {
        msgs.push({ role: 'user', content: m.content })
      }
    } else if (m.role === 'tool_call') {
      msgs.push({
        role: 'assistant',
        content: null,
        tool_calls: [{ id: m.toolCallId, type: 'function', function: { name: m.toolName, arguments: m.toolArgs ?? '{}' } }],
      })
    } else if (m.role === 'tool_result') {
      msgs.push({ role: 'tool', tool_call_id: m.toolCallResultId, content: m.content })
    }
  }

  const body: Record<string, unknown> = {
    model: config.llm.model,
    messages: msgs,
    stream: config.streamEnabled,
  }

  if (config.streamEnabled) {
    body.stream_options = { include_usage: true }
  }

  if (config.llm.temperature !== null) body.temperature = config.llm.temperature
  if (config.llm.topP !== null) body.top_p = config.llm.topP
  if (config.llm.maxTokens !== null) body.max_completion_tokens = config.llm.maxTokens

  const allTools = [
    ...(skillRefs.length > 0 ? [skillToolForChatCompletions()] : []),
    ...mcpTools.filter(t => t.enabled).map(mcpToolForChatCompletions),
  ]
  if (allTools.length > 0) {
    body.tools = allTools
    body.tool_choice = 'auto'
  }

  if (config.jsonSchema) {
    try {
      const schema = JSON.parse(config.jsonSchema)
      body.response_format = { type: 'json_schema', json_schema: schema }
    } catch { /* schema invalide, ignoré */ }
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
        for (const img of m.images) contentParts.push({ type: 'input_image', image_url: img.dataUrl })
      }
      input.push({ type: 'message', role: 'user', content: contentParts })
    } else if (m.role === 'tool_call') {
      input.push({ type: 'function_call', call_id: m.toolCallId, name: m.toolName, arguments: m.toolArgs ?? '{}' })
    } else if (m.role === 'tool_result') {
      input.push({ type: 'function_call_output', call_id: m.toolCallResultId, output: m.content })
    }
  }

  const body: Record<string, unknown> = {
    model: config.llm.model,
    input,
    stream: config.streamEnabled,
    store: false,
  }

  if (systemPrompt) body.instructions = systemPrompt

  if (config.llm.temperature !== null) body.temperature = config.llm.temperature
  if (config.llm.topP !== null) body.top_p = config.llm.topP
  if (config.llm.maxTokens !== null) body.max_output_tokens = config.llm.maxTokens

  const allTools = [
    ...(skillRefs.length > 0 ? [skillToolForResponsesAPI()] : []),
    ...mcpTools.filter(t => t.enabled).map(mcpToolForResponsesAPI),
  ]
  if (allTools.length > 0) body.tools = allTools

  if (config.jsonSchema) {
    try {
      const schema = JSON.parse(config.jsonSchema)
      body.text = { format: { type: 'json_schema', name: 'output', strict: false, schema } }
    } catch { /* ignoré */ }
  }

  return body
}

export function buildLmStudioChatBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  previousResponseId?: string,
) {
  // Trouver le dernier message utilisateur (le tour courant)
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user' && !m.isError)

  // input = liste d'items {type:"text"|"image"} du tour courant uniquement
  const input: unknown[] = []
  if (lastUserMsg) {
    if (lastUserMsg.content) input.push({ type: 'text', content: lastUserMsg.content })
    for (const img of lastUserMsg.images ?? []) input.push({ type: 'image', data_url: img.dataUrl })
  }

  const body: Record<string, unknown> = {
    model: config.llm.model,
    input,
    stream: config.streamEnabled,
    store: true,
  }

  if (previousResponseId) body.previous_response_id = previousResponseId
  if (systemPrompt) body.system_prompt = systemPrompt
  if (config.llm.temperature !== null) body.temperature = config.llm.temperature
  if (config.llm.topP !== null) body.top_p = config.llm.topP
  if (config.llm.maxTokens !== null) body.max_output_tokens = config.llm.maxTokens

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
  return usesResponsesAPI(config)
    ? buildOpenAIResponsesBody(config, messages, systemPrompt, skillRefs, mcpTools)
    : buildChatCompletionsBody(config, messages, systemPrompt, skillRefs, mcpTools)
}
