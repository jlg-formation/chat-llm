import type { AppConfig, ChatMessage, McpTool } from '../../types'
import { addExchange, updateExchange } from '../../store/httpStore'
import { genId, usesResponsesAPI, getEndpoint, getHeaders, getPedagogicHeaders } from './helpers'
import { buildBody } from './bodyBuilders'
import { streamOpenAIResponses, streamChatCompletions, streamLmStudioChat, parseLmStudioChatNonStreaming, parseNonStreamingResponse } from './parsers'

export type { SkillRef, LLMToolCall, LLMResult } from './types'

export async function sendMessage(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: import('./types').SkillRef[],
  mcpTools: McpTool[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<import('./types').LLMResult> {
  const isLmStudioChat = config.llm.apiFormat === 'lmstudio_chat'
  const isResponsesAPI = usesResponsesAPI(config)
  const isOllama = config.llm.provider === 'ollama'

  const body = buildBody(config, messages, systemPrompt, skillRefs, mcpTools)
  const endpoint = getEndpoint(config)
  const headers = getHeaders(config)

  const exchangeId = genId()
  addExchange({
    id: exchangeId,
    timestamp: Date.now(),
    type: 'llm',
    method: 'POST',
    url: endpoint,
    requestHeaders: getPedagogicHeaders(headers, config),
    requestBody: body,
  })

  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal })

  const respHeaders: Record<string, string> = {}
  for (const k of ['content-type', 'x-request-id', 'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests', 'x-ratelimit-reset-requests']) {
    const v = response.headers.get(k)
    if (v) respHeaders[k] = v
  }

  if (!response.ok) {
    const errText = await response.text()
    updateExchange(exchangeId, { responseStatus: response.status, responseHeaders: respHeaders, responseBody: errText, error: `HTTP ${response.status}` })
    throw new Error(`HTTP ${response.status}: ${errText}`)
  }

  if (config.streamEnabled) {
    const result = isLmStudioChat
      ? await streamLmStudioChat(response, onToken)
      : isResponsesAPI
        ? await streamOpenAIResponses(response, onToken)
        : await streamChatCompletions(response, isOllama, onToken)

    updateExchange(exchangeId, {
      responseStatus: response.status,
      responseHeaders: respHeaders,
      responseBody: result.type === 'text'
        ? { streaming_response: result.content }
        : { tool_calls: result.calls },
    })
    return result
  } else {
    const json = await response.json()
    const result = isLmStudioChat
      ? parseLmStudioChatNonStreaming(json)
      : parseNonStreamingResponse(json, isResponsesAPI, isOllama)
    updateExchange(exchangeId, { responseStatus: response.status, responseHeaders: respHeaders, responseBody: json })
    return result
  }
}
