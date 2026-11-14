import { DEFAULT_CONFIG } from '@/types'
import type { AppConfig, ChatMessage } from '@/types'

export function makeConfig(
  overrides: Partial<AppConfig> = {},
  llm: Partial<AppConfig['llm']> = {},
): AppConfig {
  return { ...DEFAULT_CONFIG, ...overrides, llm: { ...DEFAULT_CONFIG.llm, ...llm } }
}

export function makeMessage(partial: Partial<ChatMessage> & Pick<ChatMessage, 'role'>): ChatMessage {
  return { id: 'm', content: '', ...partial }
}

export function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status, headers: { 'content-type': 'text/event-stream' } })
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}
