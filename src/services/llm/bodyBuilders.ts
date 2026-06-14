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

  if (config.llm.temperature !== null) body.temperature = config.llm.temperature
  if (config.llm.topP !== null) body.top_p = config.llm.topP
  if (config.llm.maxTokens !== null) body.max_tokens = config.llm.maxTokens

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

  if (systemPrompt) input.push({ role: 'system', content: systemPrompt })

  for (const m of messages) {
    if (m.role === 'assistant') {
      input.push({ role: 'assistant', content: m.content })
    } else if (m.role === 'user') {
      if (m.images && m.images.length > 0) {
        const contentParts: unknown[] = []
        if (m.content) contentParts.push({ type: 'input_text', text: m.content })
        for (const img of m.images) contentParts.push({ type: 'input_image', image_url: img.dataUrl })
        input.push({ role: 'user', content: contentParts })
      } else {
        input.push({ role: 'user', content: m.content })
      }
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
  }

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

export function buildBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: SkillRef[],
  mcpTools: McpTool[],
) {
  return usesResponsesAPI(config)
    ? buildOpenAIResponsesBody(config, messages, systemPrompt, skillRefs, mcpTools)
    : buildChatCompletionsBody(config, messages, systemPrompt, skillRefs, mcpTools)
}
