import type { LLMResult } from './types'
import type { TokenUsage } from '../../types'
import { parseSSEEvents } from '../sse'

export async function streamLmStudioChat(
  response: Response,
  onToken: (t: string) => void,
): Promise<LLMResult> {
  let fullText = ''
  let responseId: string | undefined
  let usage: TokenUsage | undefined

  for await (const { event, data } of parseSSEEvents(response.body!)) {
    try {
      const json = JSON.parse(data) as Record<string, unknown>
      if (event === 'message.delta') {
        const chunk = (json.content as string) ?? ''
        if (chunk) {
          fullText += chunk
          onToken(chunk)
        }
      } else if (event === 'chat.end') {
        responseId = (json.response_id as string) ?? undefined
        if (json.input_tokens !== undefined) {
          usage = {
            promptTokens: (json.input_tokens as number) ?? 0,
            completionTokens: (json.total_output_tokens as number) ?? 0,
          }
        }
      }
    } catch {
      /* chunk non-JSON */
    }
  }

  return { type: 'text', content: fullText, usage, responseId }
}

export function parseLmStudioChatNonStreaming(json: unknown): LLMResult {
  const obj = json as Record<string, unknown>
  const outputs = (obj.output as unknown[]) ?? []
  let text = ''
  const responseId = (obj.response_id as string) ?? undefined
  const stats = obj.stats as Record<string, unknown> | undefined
  const usage: TokenUsage | undefined = stats
    ? {
        promptTokens: (stats.input_tokens as number) ?? 0,
        completionTokens: (stats.total_output_tokens as number) ?? 0,
      }
    : undefined

  for (const out of outputs) {
    const o = out as Record<string, unknown>
    if (o.type === 'message') text += (o.content as string) ?? ''
  }

  return { type: 'text', content: text, usage, responseId }
}
