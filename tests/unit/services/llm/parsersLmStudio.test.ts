import { describe, it, expect } from 'vitest'
import { streamLmStudioChat, parseLmStudioChatNonStreaming } from '@/services/llm/parsersLmStudio'
import { sseResponse } from '../../fixtures'

const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`

describe('streamLmStudioChat', () => {
  it('streams message deltas and reads chat.end metadata', async () => {
    const tokens: string[] = []
    const res = sseResponse([
      event('message.delta', { content: 'Sa' }),
      event('message.delta', { content: '' }),
      event('message.delta', { content: 'lut' }),
      event('chat.end', { response_id: 'resp-9', input_tokens: 12, total_output_tokens: 3 }),
    ])
    const result = await streamLmStudioChat(res, (t) => tokens.push(t))
    expect(tokens).toEqual(['Sa', 'lut'])
    expect(result).toEqual({
      type: 'text',
      content: 'Salut',
      usage: { promptTokens: 12, completionTokens: 3 },
      responseId: 'resp-9',
    })
  })

  it('leaves usage undefined when chat.end has no input_tokens', async () => {
    const res = sseResponse([event('chat.end', { response_id: 'r' })])
    const result = await streamLmStudioChat(res, () => {})
    expect(result).toEqual({ type: 'text', content: '', usage: undefined, responseId: 'r' })
  })

  it('ignores unknown events and malformed JSON', async () => {
    const res = sseResponse([
      'event: other\ndata: {"x":1}\n\n',
      'event: message.delta\ndata: {broken\n\n',
      'event: message.delta\n\n',
    ])
    const result = await streamLmStudioChat(res, () => {})
    expect(result).toEqual({ type: 'text', content: '', usage: undefined, responseId: undefined })
  })
})

describe('parseLmStudioChatNonStreaming', () => {
  it('concatenates message outputs and reads stats', () => {
    const json = {
      response_id: 'r7',
      output: [
        { type: 'reasoning', content: 'ignored' },
        { type: 'message', content: 'Hel' },
        { type: 'message', content: 'lo' },
      ],
      stats: { input_tokens: 5, total_output_tokens: 6 },
    }
    expect(parseLmStudioChatNonStreaming(json)).toEqual({
      type: 'text',
      content: 'Hello',
      usage: { promptTokens: 5, completionTokens: 6 },
      responseId: 'r7',
    })
  })

  it('handles a payload without output or stats', () => {
    expect(parseLmStudioChatNonStreaming({})).toEqual({
      type: 'text',
      content: '',
      usage: undefined,
      responseId: undefined,
    })
  })

  it('treats a message without content as empty text', () => {
    expect(parseLmStudioChatNonStreaming({ output: [{ type: 'message' }] })).toMatchObject({
      content: '',
    })
  })
})
