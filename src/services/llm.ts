import type { AppConfig, ChatMessage, HttpExchange } from '../types'
import { addExchange, updateExchange } from '../store/httpStore'

function genId() {
  return Math.random().toString(36).slice(2)
}

function sanitizeKey(key: string) {
  if (!key) return '(non définie)'
  return key.slice(0, 8) + '…'
}

function currentApiKey(config: AppConfig): string {
  return config.llm.apiKeys[config.llm.provider] ?? ''
}

// ─── Types publics ────────────────────────────────────────────────────────────

export interface SkillRef {
  name: string
  description: string
}

export interface LLMToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  rawArgs: string
}

export type LLMResult =
  | { type: 'text'; content: string }
  | { type: 'tool_calls'; calls: LLMToolCall[]; responseId?: string; rawAssistantMsg?: unknown }

// ─── Helpers réseau ───────────────────────────────────────────────────────────

function usesResponsesAPI(config: AppConfig): boolean {
  if (config.llm.provider === 'ollama') return false
  if (config.llm.provider === 'openai') return true
  return config.llm.apiFormat === 'responses'
}

function getEndpoint(config: AppConfig): string {
  const base = config.llm.baseUrl.replace(/\/$/, '')
  if (config.llm.provider === 'ollama') return `${base}/api/chat`
  if (usesResponsesAPI(config)) return `${base}/v1/responses`
  return `${base}/v1/chat/completions`
}

function getHeaders(config: AppConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': config.streamEnabled ? 'text/event-stream' : 'application/json',
  }
  const key = currentApiKey(config)
  if (key) headers['Authorization'] = `Bearer ${key}`
  return headers
}

function getPedagogicHeaders(headers: Record<string, string>, config: AppConfig): Record<string, string> {
  const result: Record<string, string> = {}
  if (headers['Authorization']) result['Authorization'] = `Bearer ${sanitizeKey(currentApiKey(config))}`
  if (headers['Content-Type']) result['Content-Type'] = headers['Content-Type']
  if (headers['Accept']) result['Accept'] = headers['Accept']
  return result
}

// ─── Définition du tool skill ─────────────────────────────────────────────────

function skillToolForResponsesAPI() {
  return {
    type: 'function',
    name: 'get_skill_details',
    description: "Récupère les instructions complètes d'un skill disponible. Appelle cet outil avant de répondre si tu as besoin des détails d'un skill.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom exact du skill à récupérer' },
      },
      required: ['name'],
    },
  }
}

function skillToolForChatCompletions() {
  return {
    type: 'function',
    function: {
      name: 'get_skill_details',
      description: "Récupère les instructions complètes d'un skill disponible. Appelle cet outil avant de répondre si tu as besoin des détails d'un skill.",
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom exact du skill à récupérer' },
        },
        required: ['name'],
      },
    },
  }
}

// ─── Body builders ────────────────────────────────────────────────────────────

function mcpToolForChatCompletions(tool: import('../types').McpTool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: (tool.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
    },
  }
}

function mcpToolForResponsesAPI(tool: import('../types').McpTool) {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: (tool.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
  }
}

function buildChatCompletionsBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: SkillRef[],
  mcpTools: import('../types').McpTool[],
) {
  const msgs: unknown[] = []

  if (systemPrompt) {
    msgs.push({ role: 'system', content: systemPrompt })
  }

  for (const m of messages) {
    if (m.role === 'assistant') {
      msgs.push({ role: 'assistant', content: m.content })
    } else if (m.role === 'user') {
      if (m.images && m.images.length > 0) {
        const parts: unknown[] = [{ type: 'text', text: m.content }]
        for (const img of m.images) {
          parts.push({ type: 'image_url', image_url: { url: img.dataUrl } })
        }
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

function buildOpenAIResponsesBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: SkillRef[],
  mcpTools: import('../types').McpTool[],
) {
  const input: unknown[] = []

  if (systemPrompt) {
    input.push({ role: 'system', content: systemPrompt })
  }

  for (const m of messages) {
    if (m.role === 'assistant') {
      input.push({ role: 'assistant', content: m.content })
    } else if (m.role === 'user') {
      if (m.images && m.images.length > 0) {
        const contentParts: unknown[] = []
        if (m.content) contentParts.push({ type: 'input_text', text: m.content })
        for (const img of m.images) {
          contentParts.push({ type: 'input_image', image_url: img.dataUrl })
        }
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

  const allTools = [
    ...(skillRefs.length > 0 ? [skillToolForResponsesAPI()] : []),
    ...mcpTools.filter(t => t.enabled).map(mcpToolForResponsesAPI),
  ]
  if (allTools.length > 0) {
    body.tools = allTools
  }

  if (config.jsonSchema) {
    try {
      const schema = JSON.parse(config.jsonSchema)
      body.text = { format: { type: 'json_schema', name: 'output', strict: false, schema } }
    } catch { /* ignoré */ }
  }

  return body
}

// ─── Parseurs de réponse ──────────────────────────────────────────────────────

async function* parseSSEStream(response: Response): AsyncGenerator<string> {
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

function safeParseArgs(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

async function streamOpenAIResponses(response: Response, onToken: (t: string) => void): Promise<LLMResult> {
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

async function streamChatCompletions(response: Response, isOllama: boolean, onToken: (t: string) => void): Promise<LLMResult> {
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

function parseNonStreamingResponse(json: unknown, isOpenAI: boolean, isOllama: boolean): LLMResult {
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
        const content = o.content as unknown[]
        for (const c of content ?? []) {
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

  // Chat Completions
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

// ─── API publique ─────────────────────────────────────────────────────────────

export async function sendMessage(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  skillRefs: SkillRef[],
  mcpTools: import('../types').McpTool[],
  onToken: (token: string) => void,
): Promise<LLMResult> {
  const isResponsesAPI = usesResponsesAPI(config)
  const isOllama = config.llm.provider === 'ollama'

  const body = isResponsesAPI
    ? buildOpenAIResponsesBody(config, messages, systemPrompt, skillRefs, mcpTools)
    : buildChatCompletionsBody(config, messages, systemPrompt, skillRefs, mcpTools)

  const endpoint = getEndpoint(config)
  const headers = getHeaders(config)

  const exchangeId = genId()
  const exchange: HttpExchange = {
    id: exchangeId,
    timestamp: Date.now(),
    type: 'llm',
    method: 'POST',
    url: endpoint,
    requestHeaders: getPedagogicHeaders(headers, config),
    requestBody: body,
  }
  addExchange(exchange)

  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) })

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
    const result = isResponsesAPI
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
    const result = parseNonStreamingResponse(json, isResponsesAPI, isOllama)
    updateExchange(exchangeId, { responseStatus: response.status, responseHeaders: respHeaders, responseBody: json })
    return result
  }
}
