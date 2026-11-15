import type { Page, Route } from '@playwright/test'

// Corps JSON de requête inspectés librement dans les assertions
// oxlint-disable-next-line typescript/no-explicit-any
export type Json = any

export const ANTHROPIC_CONFIG = {
  llm: {
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiFormat: 'anthropic_messages',
    model: 'claude-haiku-5-5',
    apiKeys: { anthropic: 'sk-ant-test-key' },
  },
}

export interface AnthropicBlock {
  type: 'text' | 'thinking' | 'redacted_thinking' | 'tool_use'
  text?: string
  thinking?: string
  signature?: string
  data?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

interface Usage {
  input_tokens: number
  output_tokens: number
}

export interface CapturedRequest {
  headers: Record<string, string>
  body: Json
}

const sse = (event: string, data: Record<string, unknown>) =>
  `event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`

/** Réponse non-streaming de l'API Messages. */
export function anthropicMessage(
  content: AnthropicBlock[],
  usage: Usage = { input_tokens: 10, output_tokens: 5 },
) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content,
    stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
    usage,
  }
}

/** Flux SSE de l'API Messages pour une liste de blocs. */
export function anthropicSSE(
  blocks: AnthropicBlock[],
  usage: Usage = { input_tokens: 10, output_tokens: 5 },
): string {
  let out = sse('message_start', {
    message: {
      id: 'msg_test',
      usage: { input_tokens: usage.input_tokens, output_tokens: 1 },
    },
  })
  blocks.forEach((b, index) => {
    const start = (content_block: Record<string, unknown>) =>
      sse('content_block_start', { index, content_block })
    const delta = (d: Record<string, unknown>) => sse('content_block_delta', { index, delta: d })

    if (b.type === 'text') {
      out += start({ type: 'text', text: '' })
      out += delta({ type: 'text_delta', text: b.text })
    } else if (b.type === 'thinking') {
      out += start({ type: 'thinking', thinking: '', signature: '' })
      out += delta({ type: 'thinking_delta', thinking: b.thinking })
      out += delta({ type: 'signature_delta', signature: b.signature })
    } else if (b.type === 'redacted_thinking') {
      out += start({ type: 'redacted_thinking', data: b.data })
    } else {
      out += start({ type: 'tool_use', id: b.id, name: b.name, input: {} })
      out += delta({
        type: 'input_json_delta',
        partial_json: JSON.stringify(b.input ?? {}),
      })
    }
    out += sse('content_block_stop', { index })
  })
  out += sse('message_delta', {
    delta: { stop_reason: 'end_turn' },
    usage: { output_tokens: usage.output_tokens },
  })
  out += sse('message_stop', {})
  return out
}

/**
 * Intercepte POST /v1/messages ; `respond(body, n)` renvoie les blocs de la n-ième réponse.
 * Retourne la liste (mutable) des requêtes reçues.
 */
export async function interceptAnthropic(
  page: Page,
  respond: (body: Json, n: number) => AnthropicBlock[],
  usage?: Usage,
): Promise<CapturedRequest[]> {
  const requests: CapturedRequest[] = []
  await page.route('**/v1/messages', async (route: Route) => {
    const body = route.request().postDataJSON() as Json
    requests.push({ headers: route.request().headers(), body })
    const blocks = respond(body, requests.length)
    if (body.stream) {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Access-Control-Allow-Origin': '*',
        },
        body: anthropicSSE(blocks, usage),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(anthropicMessage(blocks, usage)),
      })
    }
  })
  return requests
}
