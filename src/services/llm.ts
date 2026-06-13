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

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildChatCompletionsBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemWithSkills: string
) {
  const msgs: unknown[] = []

  if (systemWithSkills) {
    msgs.push({ role: 'system', content: systemWithSkills })
  }

  for (const m of messages) {
    if (m.role === 'assistant') {
      msgs.push({ role: 'assistant', content: m.content })
    } else if (m.role === 'user') {
      if (m.images && m.images.length > 0) {
        const parts: unknown[] = [{ type: 'text', text: m.content }]
        for (const img of m.images) {
          parts.push({
            type: 'image_url',
            image_url: { url: img.dataUrl },
          })
        }
        msgs.push({ role: 'user', content: parts })
      } else {
        msgs.push({ role: 'user', content: m.content })
      }
    }
  }

  const body: Record<string, unknown> = {
    model: config.llm.model,
    messages: msgs,
    stream: config.streamEnabled,
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
  systemWithSkills: string
) {
  const input: unknown[] = []

  if (systemWithSkills) {
    input.push({ role: 'system', content: systemWithSkills })
  }

  for (const m of messages) {
    if (m.role === 'assistant') {
      input.push({ role: 'assistant', content: m.content })
    } else if (m.role === 'user') {
      if (m.images && m.images.length > 0) {
        const contentParts: unknown[] = []
        if (m.content) contentParts.push({ type: 'input_text', text: m.content })
        for (const img of m.images) {
          contentParts.push({
            type: 'input_image',
            image_url: img.dataUrl,
          })
        }
        input.push({ role: 'user', content: contentParts })
      } else {
        input.push({ role: 'user', content: m.content })
      }
    }
  }

  const body: Record<string, unknown> = {
    model: config.llm.model,
    input,
    stream: config.streamEnabled,
  }

  if (config.jsonSchema) {
    try {
      const schema = JSON.parse(config.jsonSchema)
      body.text = { format: { type: 'json_schema', name: 'output', strict: false, schema } }
    } catch { /* ignoré */ }
  }

  return body
}

function getEndpoint(config: AppConfig): string {
  const base = config.llm.baseUrl.replace(/\/$/, '')
  if (config.llm.provider === 'openai') return `${base}/v1/responses`
  if (config.llm.provider === 'ollama') return `${base}/api/chat`
  return `${base}/v1/chat/completions`
}

function getHeaders(config: AppConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': config.streamEnabled ? 'text/event-stream' : 'application/json',
  }
  const key = currentApiKey(config)
  if (key) {
    headers['Authorization'] = `Bearer ${key}`
  }
  return headers
}

function getPedagogicHeaders(headers: Record<string, string>, config: AppConfig): Record<string, string> {
  const result: Record<string, string> = {}
  if (headers['Authorization']) {
    result['Authorization'] = `Bearer ${sanitizeKey(currentApiKey(config))}`
  }
  if (headers['Content-Type']) result['Content-Type'] = headers['Content-Type']
  if (headers['Accept']) result['Accept'] = headers['Accept']
  return result
}

// ─── Stream parsers ──────────────────────────────────────────────────────────

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

function extractDeltaOpenAIResponses(json: unknown): string {
  const obj = json as Record<string, unknown>
  if (obj.type === 'response.output_text.delta') {
    return (obj.delta as string) ?? ''
  }
  return ''
}

function extractDeltaChatCompletions(json: unknown): string {
  try {
    const choices = (json as Record<string, unknown>).choices as unknown[]
    const delta = (choices[0] as Record<string, unknown>).delta as Record<string, unknown>
    return (delta.content as string) ?? ''
  } catch {
    return ''
  }
}

function extractDeltaOllama(json: unknown): string {
  try {
    const msg = (json as Record<string, unknown>).message as Record<string, unknown>
    return (msg.content as string) ?? ''
  } catch {
    return ''
  }
}

// ─── API principale ──────────────────────────────────────────────────────────

export async function sendMessage(
  config: AppConfig,
  messages: ChatMessage[],
  systemWithSkills: string,
  onToken: (token: string) => void
): Promise<string> {
  const isOpenAI = config.llm.provider === 'openai'
  const isOllama = config.llm.provider === 'ollama'

  const body = isOpenAI
    ? buildOpenAIResponsesBody(config, messages, systemWithSkills)
    : buildChatCompletionsBody(config, messages, systemWithSkills)

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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const respHeaders: Record<string, string> = {}
  const pedagogicRespKeys = ['content-type', 'x-request-id', 'x-ratelimit-limit-requests',
    'x-ratelimit-remaining-requests', 'x-ratelimit-reset-requests']
  for (const k of pedagogicRespKeys) {
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
    let fullText = ''
    for await (const rawData of parseSSEStream(response)) {
      try {
        const json = JSON.parse(rawData)
        let delta = ''
        if (isOpenAI) delta = extractDeltaOpenAIResponses(json)
        else if (isOllama) delta = extractDeltaOllama(json)
        else delta = extractDeltaChatCompletions(json)
        if (delta) {
          fullText += delta
          onToken(delta)
        }
      } catch { /* chunk non JSON */ }
    }
    updateExchange(exchangeId, {
      responseStatus: response.status,
      responseHeaders: respHeaders,
      responseBody: { streaming_response: fullText },
    })
    return fullText
  } else {
    const json = await response.json()
    let text = ''
    if (isOpenAI) {
      const outputs = (json as Record<string, unknown>).output as unknown[]
      for (const out of outputs ?? []) {
        const o = out as Record<string, unknown>
        if (o.type === 'message') {
          const content = o.content as unknown[]
          for (const c of content ?? []) {
            const cObj = c as Record<string, unknown>
            if (cObj.type === 'output_text') text += cObj.text as string
          }
        }
      }
    } else if (isOllama) {
      const msg = (json as Record<string, unknown>).message as Record<string, unknown>
      text = (msg?.content as string) ?? ''
    } else {
      const choices = (json as Record<string, unknown>).choices as unknown[]
      const msg = (choices?.[0] as Record<string, unknown>)?.message as Record<string, unknown>
      text = (msg?.content as string) ?? ''
    }
    updateExchange(exchangeId, {
      responseStatus: response.status,
      responseHeaders: respHeaders,
      responseBody: json,
    })
    return text
  }
}

// ─── MCP ─────────────────────────────────────────────────────────────────────

export async function fetchMcpTools(mcpUrl: string): Promise<import('../types').McpTool[]> {
  const url = `${mcpUrl.replace(/\/$/, '')}/tools/list`
  const exchangeId = genId()
  addExchange({
    id: exchangeId,
    timestamp: Date.now(),
    type: 'mcp',
    method: 'GET',
    url,
    requestHeaders: { 'Content-Type': 'application/json' },
    requestBody: null,
  })

  const resp = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
  const json = await resp.json()
  const tools = (json.tools ?? []) as Array<{ name: string; description: string; inputSchema?: unknown }>
  updateExchange(exchangeId, { responseStatus: resp.status, responseBody: json })
  return tools.map(t => ({ name: t.name, description: t.description, enabled: true, inputSchema: t.inputSchema }))
}
