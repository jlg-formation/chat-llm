import { describe, it, expect, vi } from 'vitest'
import {
  streamAnthropicMessages,
  parseAnthropicNonStreaming,
} from '@/services/llm/parsersAnthropic'
import { sseResponse } from '../../fixtures'

const ev = (type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`

const start = (input = 10) =>
  ev('message_start', {
    message: { usage: { input_tokens: input, output_tokens: 1 } },
  })
const end = (out = 5) =>
  ev('message_delta', {
    delta: { stop_reason: 'end_turn' },
    usage: { output_tokens: out },
  }) + ev('message_stop', {})

describe('streamAnthropicMessages', () => {
  it('streams text, thinking and usage', async () => {
    const onToken = vi.fn()
    const onThinking = vi.fn()
    const res = await streamAnthropicMessages(
      sseResponse([
        start(),
        ev('ping', {}),
        ev('content_block_start', {
          index: 0,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        }),
        ev('content_block_delta', {
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'Je ' },
        }),
        ev('content_block_delta', {
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'pense' },
        }),
        ev('content_block_delta', {
          index: 0,
          delta: { type: 'signature_delta', signature: 'SIG' },
        }),
        ev('content_block_stop', { index: 0 }),
        ev('content_block_start', {
          index: 1,
          content_block: { type: 'text', text: '' },
        }),
        ev('content_block_delta', {
          index: 1,
          delta: { type: 'text_delta', text: 'Bon' },
        }),
        ev('content_block_delta', {
          index: 1,
          delta: { type: 'text_delta', text: 'jour' },
        }),
        end(),
      ]),
      onToken,
      onThinking,
    )
    expect(onToken).toHaveBeenNthCalledWith(1, 'Bon')
    expect(onThinking).toHaveBeenNthCalledWith(2, 'pense')
    expect(res).toEqual({
      type: 'text',
      content: 'Bonjour',
      thinking: 'Je pense',
      usage: { promptTokens: 10, completionTokens: 5 },
    })
  })

  it('assembles tool_use input and keeps thinking blocks verbatim', async () => {
    const res = await streamAnthropicMessages(
      sseResponse([
        start(),
        ev('content_block_start', {
          index: 0,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        }),
        ev('content_block_delta', {
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'x' },
        }),
        ev('content_block_delta', {
          index: 0,
          delta: { type: 'signature_delta', signature: 'S' },
        }),
        ev('content_block_start', {
          index: 1,
          content_block: { type: 'redacted_thinking', data: 'ENC' },
        }),
        ev('content_block_start', {
          index: 2,
          content_block: {
            type: 'tool_use',
            id: 'tu1',
            name: 'recherche',
            input: {},
          },
        }),
        ev('content_block_delta', {
          index: 2,
          delta: { type: 'input_json_delta', partial_json: '{"q":' },
        }),
        ev('content_block_delta', {
          index: 2,
          delta: { type: 'input_json_delta', partial_json: '"chat"}' },
        }),
        ev('content_block_start', {
          index: 3,
          content_block: {
            type: 'tool_use',
            id: 'tu2',
            name: 'vide',
            input: {},
          },
        }),
        end(),
      ]),
      vi.fn(),
    )
    expect(res.type).toBe('tool_calls')
    if (res.type !== 'tool_calls') return
    expect(res.calls).toEqual([
      {
        id: 'tu1',
        name: 'recherche',
        args: { q: 'chat' },
        rawArgs: '{"q":"chat"}',
      },
      { id: 'tu2', name: 'vide', args: {}, rawArgs: '{}' },
    ])
    expect(res.thinkingBlocks).toEqual([
      { type: 'thinking', thinking: 'x', signature: 'S' },
      { type: 'redacted_thinking', data: 'ENC' },
    ])
  })

  it('falls back to empty input on invalid tool JSON', async () => {
    const res = await streamAnthropicMessages(
      sseResponse([
        ev('content_block_start', {
          index: 0,
          content_block: { type: 'tool_use', id: 't', name: 'n', input: {} },
        }),
        ev('content_block_delta', {
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{bad' },
        }),
      ]),
      vi.fn(),
    )
    expect(res.type === 'tool_calls' && res.calls[0].args).toEqual({})
  })

  it('throws on stream error events', async () => {
    await expect(
      streamAnthropicMessages(
        sseResponse([
          ev('error', {
            error: { type: 'overloaded_error', message: 'Surcharge' },
          }),
        ]),
        vi.fn(),
      ),
    ).rejects.toThrow('Surcharge')
    await expect(streamAnthropicMessages(sseResponse([ev('error', {})]), vi.fn())).rejects.toThrow(
      'Erreur Anthropic',
    )
  })

  it('ignores non-JSON chunks and deltas for unknown blocks; usage is optional', async () => {
    const res = await streamAnthropicMessages(
      sseResponse([
        'event: x\ndata: not-json\n\n',
        ev('content_block_delta', {
          index: 9,
          delta: { type: 'text_delta', text: '?' },
        }),
        ev('content_block_start', {
          index: 0,
          content_block: { type: 'text', text: '' },
        }),
        ev('content_block_delta', {
          index: 0,
          delta: { type: 'text_delta', text: 'ok' },
        }),
      ]),
      vi.fn(),
    )
    expect(res).toEqual({
      type: 'text',
      content: 'ok',
      usage: undefined,
      thinking: undefined,
    })
  })

  it('reads usage from message_delta with input tokens', async () => {
    const res = await streamAnthropicMessages(
      sseResponse([ev('message_delta', { usage: { input_tokens: 7, output_tokens: 3 } })]),
      vi.fn(),
    )
    expect(res.usage).toEqual({ promptTokens: 7, completionTokens: 3 })
  })
})

describe('parseAnthropicNonStreaming', () => {
  it('parses text, thinking and usage', () => {
    const res = parseAnthropicNonStreaming({
      content: [
        { type: 'thinking', thinking: 'réfléchi', signature: 's' },
        { type: 'text', text: 'Réponse' },
      ],
      usage: { input_tokens: 4, output_tokens: 2 },
    })
    expect(res).toEqual({
      type: 'text',
      content: 'Réponse',
      thinking: 'réfléchi',
      usage: { promptTokens: 4, completionTokens: 2 },
    })
  })

  it('parses tool_use blocks and keeps thinking blocks', () => {
    const res = parseAnthropicNonStreaming({
      content: [
        { type: 'redacted_thinking', data: 'E' },
        { type: 'tool_use', id: 't', name: 'n', input: { a: 1 } },
      ],
    })
    expect(res).toEqual({
      type: 'tool_calls',
      calls: [{ id: 't', name: 'n', args: { a: 1 }, rawArgs: '{"a":1}' }],
      usage: undefined,
      thinking: undefined,
      thinkingBlocks: [{ type: 'redacted_thinking', data: 'E' }],
    })
  })

  it('handles a response without content', () => {
    expect(parseAnthropicNonStreaming({})).toEqual({
      type: 'text',
      content: '',
      usage: undefined,
      thinking: undefined,
    })
  })
})
