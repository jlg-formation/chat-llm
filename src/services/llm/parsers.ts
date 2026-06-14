import type { LLMResult, LLMToolCall } from './types'

export async function* parseSSEStream(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        yield data
      }
    }
  }
}

export function safeParseArgs(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

export async function streamOpenAIResponses(response: Response, onToken: (t: string) => void): Promise<LLMResult> {
  let fullText = ''
  let responseId = ''
  const pendingCalls = new Map<string, { call_id: string; name: string; argsBuffer: string }>()

  for await (const rawData of parseSSEStream(response)) {
    try {
      const json = JSON.parse(rawData) as Record<string, unknown>
      switch (json.type as string) {
        case 'response.output_text.delta':
          fullText += json.delta as string
          onToken(json.delta as string)
          break
        case 'response.output_item.added': {
          const item = json.item as Record<string, unknown>
          if (item.type === 'function_call') {
            pendingCalls.set(item.id as string, { call_id: item.call_id as string, name: item.name as string, argsBuffer: '' })
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
          break
        }
      }
    } catch { /* chunk non-JSON */ }
  }

  if (pendingCalls.size > 0) {
    return {
      type: 'tool_calls',
      calls: [...pendingCalls.values()].map(c => ({
        id: c.call_id,
        name: c.name,
        rawArgs: c.argsBuffer,
        args: safeParseArgs(c.argsBuffer),
      })),
      responseId,
    }
  }
  return { type: 'text', content: fullText }
}

export async function streamChatCompletions(response: Response, isOllama: boolean, onToken: (t: string) => void): Promise<LLMResult> {
  let fullText = ''
  const toolCallsMap = new Map<number, { id: string; name: string; argsBuffer: string }>()
  let finishReason = ''

  for await (const rawData of parseSSEStream(response)) {
    try {
      const json = JSON.parse(rawData) as Record<string, unknown>

      if (isOllama) {
        const msg = json.message as Record<string, unknown>
        const delta = (msg?.content as string) ?? ''
        if (delta) { fullText += delta; onToken(delta) }
        continue
      }

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
          const existing = toolCallsMap.get(idx) ?? { id: '', name: '', argsBuffer: '' }
          if (tc.id) existing.id = tc.id as string
          const fn = tc.function as Record<string, unknown>
          if (fn?.name) existing.name = fn.name as string
          if (fn?.arguments) existing.argsBuffer += fn.arguments as string
          toolCallsMap.set(idx, existing)
        }
      }
    } catch { /* chunk non-JSON */ }
  }

  if (finishReason === 'tool_calls' || toolCallsMap.size > 0) {
    return {
      type: 'tool_calls',
      calls: [...toolCallsMap.values()].map(tc => ({
        id: tc.id,
        name: tc.name,
        rawArgs: tc.argsBuffer,
        args: safeParseArgs(tc.argsBuffer),
      })),
    }
  }
  return { type: 'text', content: fullText }
}

export function parseNonStreamingResponse(json: unknown, isOpenAI: boolean, isOllama: boolean): LLMResult {
  if (isOpenAI) {
    const obj = json as Record<string, unknown>
    const responseId = obj.id as string
    const outputs = obj.output as unknown[]
    const calls: LLMToolCall[] = []
    let text = ''

    for (const out of outputs ?? []) {
      const o = out as Record<string, unknown>
      if (o.type === 'function_call') {
        const rawArgs = o.arguments as string
        calls.push({ id: o.call_id as string, name: o.name as string, rawArgs, args: safeParseArgs(rawArgs) })
      } else if (o.type === 'message') {
        for (const c of (o.content as unknown[]) ?? []) {
          const cObj = c as Record<string, unknown>
          if (cObj.type === 'output_text') text += cObj.text as string
        }
      }
    }

    if (calls.length > 0) return { type: 'tool_calls', calls, responseId }
    return { type: 'text', content: text }
  }

  if (isOllama) {
    const msg = (json as Record<string, unknown>).message as Record<string, unknown>
    return { type: 'text', content: (msg?.content as string) ?? '' }
  }

  const choices = (json as Record<string, unknown>).choices as unknown[]
  const choice = choices?.[0] as Record<string, unknown>
  const msg = choice?.message as Record<string, unknown>

  if (choice?.finish_reason === 'tool_calls') {
    const tcs = msg.tool_calls as Array<Record<string, unknown>>
    return {
      type: 'tool_calls',
      calls: tcs.map(tc => {
        const fn = tc.function as Record<string, unknown>
        const rawArgs = fn.arguments as string
        return { id: tc.id as string, name: fn.name as string, rawArgs, args: safeParseArgs(rawArgs) }
      }),
      rawAssistantMsg: msg,
    }
  }
  return { type: 'text', content: (msg?.content as string) ?? '' }
}
