import type { LLMResult, LLMToolCall } from './types'
import type { HostedActivity, TokenUsage } from '../../types'
import {
  collectHosted,
  extractUsage,
  parseSSEStream,
  toolCall,
  withHosted,
  withThinking,
} from './parsersShared'
import { ollamaRawArgs, ollamaUsage, parseNdjsonStream } from './parsersOllama'

export { parseSSEStream, safeParseArgs } from './parsersShared'

export async function streamOpenAIResponses(
  response: Response,
  onToken: (t: string) => void,
  onThinking?: (t: string) => void,
): Promise<LLMResult> {
  let fullText = ''
  let fullThinking = ''
  let responseId = ''
  let usage: TokenUsage | undefined
  let hosted: HostedActivity | undefined
  const pendingCalls = new Map<string, { call_id: string; name: string; argsBuffer: string }>()

  for await (const rawData of parseSSEStream(response)) {
    try {
      const json = JSON.parse(rawData) as Record<string, unknown>
      switch (json.type as string) {
        case 'response.output_text.delta':
          fullText += json.delta as string
          onToken(json.delta as string)
          break
        case 'response.reasoning_summary_text.delta':
          fullThinking += json.delta as string
          onThinking?.(json.delta as string)
          break
        case 'response.output_item.added': {
          const item = json.item as Record<string, unknown>
          if (item.type === 'function_call') {
            pendingCalls.set(item.id as string, {
              call_id: item.call_id as string,
              name: item.name as string,
              argsBuffer: '',
            })
          }
          break
        }
        case 'response.function_call_arguments.delta': {
          const call = pendingCalls.get(json.item_id as string)
          if (call) call.argsBuffer += json.delta as string
          break
        }
        case 'response.completed': {
          const resp = json.response as Record<string, unknown>
          responseId = (resp?.id as string) ?? ''
          usage = extractUsage(resp ?? {}) ?? usage
          hosted = collectHosted(resp?.output as unknown[] | undefined) ?? hosted
          break
        }
      }
    } catch {
      /* chunk non-JSON */
    }
  }

  if (pendingCalls.size > 0) {
    return {
      type: 'tool_calls',
      calls: [...pendingCalls.values()].map((c) => toolCall(c.call_id, c.name, c.argsBuffer)),
      responseId,
      usage,
      ...withHosted(hosted),
      ...withThinking(fullThinking),
    }
  }
  return {
    type: 'text',
    content: fullText,
    usage,
    ...withHosted(hosted),
    ...withThinking(fullThinking),
  }
}

export async function streamChatCompletions(
  response: Response,
  isOllama: boolean,
  onToken: (t: string) => void,
): Promise<LLMResult> {
  let fullText = ''
  const toolCallsMap = new Map<number, { id: string; name: string; argsBuffer: string }>()
  let finishReason = ''
  let usage: TokenUsage | undefined

  for await (const rawData of isOllama ? parseNdjsonStream(response) : parseSSEStream(response)) {
    try {
      const json = JSON.parse(rawData) as Record<string, unknown>

      if (isOllama) {
        const msg = json.message as Record<string, unknown>
        const delta = (msg?.content as string) ?? ''
        if (delta) {
          fullText += delta
          onToken(delta)
        }
        // Tool calls Ollama : présents dans message.tool_calls sur le chunk final
        const tcs = msg?.tool_calls as Array<Record<string, unknown>> | undefined
        if (tcs) {
          for (const [idx, tc] of tcs.entries()) {
            const fn = tc.function as Record<string, unknown>
            const existing = toolCallsMap.get(idx) ?? {
              id: `ollama-tool-${idx}`,
              name: '',
              argsBuffer: '',
            }
            if (fn?.name) existing.name = fn.name as string
            if (fn?.arguments) existing.argsBuffer = ollamaRawArgs(fn.arguments)
            toolCallsMap.set(idx, existing)
          }
        }
        usage = ollamaUsage(json) ?? usage
        continue
      }

      // Chunk de fin avec usage (stream_options.include_usage)
      usage = extractUsage(json) ?? usage

      const choices = json.choices as unknown[]
      const c = choices?.[0] as Record<string, unknown>
      if (!c) continue

      finishReason = (c.finish_reason as string) ?? finishReason
      const delta = c.delta as Record<string, unknown>

      if (delta?.content) {
        fullText += delta.content as string
        onToken(delta.content as string)
      }

      const tcs = delta?.tool_calls as Array<Record<string, unknown>>
      if (tcs) {
        for (const tc of tcs) {
          const idx = tc.index as number
          const existing = toolCallsMap.get(idx) ?? {
            id: '',
            name: '',
            argsBuffer: '',
          }
          if (tc.id) existing.id = tc.id as string
          const fn = tc.function as Record<string, unknown>
          if (fn?.name) existing.name = fn.name as string
          if (fn?.arguments) existing.argsBuffer += fn.arguments as string
          toolCallsMap.set(idx, existing)
        }
      }
    } catch {
      /* chunk non-JSON */
    }
  }

  if (finishReason === 'tool_calls' || toolCallsMap.size > 0) {
    return {
      type: 'tool_calls',
      calls: [...toolCallsMap.values()].map((tc) => toolCall(tc.id, tc.name, tc.argsBuffer)),
      usage,
    }
  }
  return { type: 'text', content: fullText, usage }
}

export function parseNonStreamingResponse(
  json: unknown,
  isOpenAI: boolean,
  isOllama: boolean,
): LLMResult {
  if (isOpenAI) {
    const obj = json as Record<string, unknown>
    const responseId = obj.id as string
    const outputs = obj.output as unknown[]
    const calls: LLMToolCall[] = []
    let text = ''
    let thinking = ''
    const usage = extractUsage(obj)

    for (const out of outputs ?? []) {
      const o = out as Record<string, unknown>
      if (o.type === 'function_call') {
        calls.push(toolCall(o.call_id as string, o.name as string, o.arguments as string))
      } else if (o.type === 'reasoning') {
        for (const s of (o.summary as unknown[]) ?? []) {
          thinking += (s as Record<string, unknown>).text as string
        }
      } else if (o.type === 'message') {
        for (const c of (o.content as unknown[]) ?? []) {
          const cObj = c as Record<string, unknown>
          if (cObj.type === 'output_text') text += cObj.text as string
        }
      }
    }

    const hosted = collectHosted(outputs)
    if (calls.length > 0)
      return {
        type: 'tool_calls',
        calls,
        responseId,
        usage,
        ...withHosted(hosted),
        ...withThinking(thinking),
      }
    return {
      type: 'text',
      content: text,
      usage,
      ...withHosted(hosted),
      ...withThinking(thinking),
    }
  }

  if (isOllama) {
    const obj = json as Record<string, unknown>
    const msg = obj.message as Record<string, unknown>
    const usage = ollamaUsage(obj)
    const tcs = msg?.tool_calls as Array<Record<string, unknown>> | undefined
    if (tcs && tcs.length > 0) {
      const calls = tcs.map((tc, idx) => {
        const fn = tc.function as Record<string, unknown>
        return toolCall(`ollama-tool-${idx}`, fn?.name as string, ollamaRawArgs(fn?.arguments))
      })
      return { type: 'tool_calls', calls, usage }
    }
    return { type: 'text', content: (msg?.content as string) ?? '', usage }
  }

  const obj = json as Record<string, unknown>
  const choices = obj.choices as unknown[]
  const choice = choices?.[0] as Record<string, unknown>
  const msg = choice?.message as Record<string, unknown>
  const usage = extractUsage(obj)

  if (choice?.finish_reason === 'tool_calls') {
    const tcs = msg.tool_calls as Array<Record<string, unknown>>
    return {
      type: 'tool_calls',
      calls: tcs.map((tc) => {
        const fn = tc.function as Record<string, unknown>
        return toolCall(tc.id as string, fn.name as string, fn.arguments as string)
      }),
      rawAssistantMsg: msg,
      usage,
    }
  }
  return { type: 'text', content: (msg?.content as string) ?? '', usage }
}
