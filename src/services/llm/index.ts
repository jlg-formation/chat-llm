import type { AppConfig, ChatMessage, McpTool } from '../../types'
import type { SkillRef, LLMResult } from './types'
import { addExchange, updateExchange } from '../../store/httpStore'
import { genId } from '../id'
import {
  usesResponsesAPI,
  usesOllamaNative,
  usesAnthropicNative,
  getEndpoint,
  getHeaders,
  getPedagogicHeaders,
} from './helpers'
import { buildBody } from './bodyBuilders'
import { streamOpenAIResponses, streamChatCompletions, parseNonStreamingResponse } from './parsers'
import { streamLmStudioChat, parseLmStudioChatNonStreaming } from './parsersLmStudio'
import { streamAnthropicMessages, parseAnthropicNonStreaming } from './parsersAnthropic'

export type { SkillRef, LLMToolCall, LLMResult } from './types'

export async function sendMessage(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: SkillRef[],
  mcpTools: McpTool[],
  onToken: (token: string) => void,
  signal?: AbortSignal,
  previousResponseId?: string,
  onThinking?: (token: string) => void,
): Promise<LLMResult> {
  const isLmStudioChat = config.llm.apiFormat === 'lmstudio_chat'
  const isAnthropicNative = usesAnthropicNative(config)
  const isResponsesAPI = usesResponsesAPI(config)
  const isOllama = usesOllamaNative(config)

  const body = buildBody(config, messages, systemPrompt, skillRefs, mcpTools, {
    previousResponseId,
  })
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  const respHeaders: Record<string, string> = {}
  for (const k of [
    'content-type',
    'x-request-id',
    'x-ratelimit-limit-requests',
    'x-ratelimit-remaining-requests',
    'x-ratelimit-reset-requests',
    'request-id',
    'anthropic-ratelimit-requests-remaining',
    'anthropic-ratelimit-tokens-remaining',
  ]) {
    const v = response.headers.get(k)
    if (v) respHeaders[k] = v
  }

  if (!response.ok) {
    const errText = await response.text()
    updateExchange(exchangeId, {
      responseStatus: response.status,
      responseHeaders: respHeaders,
      responseBody: errText,
      error: `HTTP ${response.status}`,
    })
    throw new Error(`HTTP ${response.status}: ${errText}`)
  }

  if (config.streamEnabled) {
    const result = isLmStudioChat
      ? await streamLmStudioChat(response, onToken)
      : isAnthropicNative
        ? await streamAnthropicMessages(response, onToken, onThinking)
        : isResponsesAPI
          ? await streamOpenAIResponses(response, onToken)
          : await streamChatCompletions(response, isOllama, onToken)

    const thinking = result.thinking ? { thinking: result.thinking } : {}
    updateExchange(exchangeId, {
      responseStatus: response.status,
      responseHeaders: respHeaders,
      responseBody:
        result.type === 'text'
          ? { streaming_response: result.content, ...thinking }
          : { tool_calls: result.calls, ...thinking },
    })
    return result
  } else {
    const json = await response.json()
    const result = isLmStudioChat
      ? parseLmStudioChatNonStreaming(json)
      : isAnthropicNative
        ? parseAnthropicNonStreaming(json)
        : parseNonStreamingResponse(json, isResponsesAPI, isOllama)
    updateExchange(exchangeId, {
      responseStatus: response.status,
      responseHeaders: respHeaders,
      responseBody: json,
    })
    return result
  }
}
