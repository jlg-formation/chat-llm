import { describe, it, expect } from 'vitest'
import {
  parseSSEStream,
  safeParseArgs,
  streamOpenAIResponses,
  streamChatCompletions,
} from '@/services/llm/parsers'
import { sseResponse } from '../../fixtures'

const sse = (...payloads: unknown[]) =>
  payloads.map((p) => `data: ${typeof p === 'string' ? p : JSON.stringify(p)}\n\n`)

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = []
  for await (const v of gen) out.push(v)
  return out
}

describe('parseSSEStream', () => {
  it('yields data payloads, stops at [DONE] and ignores other lines', async () => {
    const res = sseResponse([
      'event: x\n',
      'data: a\n\n',
      'data: b',
      '\n\n',
      'data: [DONE]\n\n',
      'data: after\n\n',
    ])
    expect(await collect(parseSSEStream(res))).toEqual(['a', 'b'])
  })
})

describe('safeParseArgs', () => {
  it('parses valid JSON and falls back to an empty object', () => {
    expect(safeParseArgs('{"a":1}')).toEqual({ a: 1 })
    expect(safeParseArgs('')).toEqual({})
    expect(safeParseArgs('{bad')).toEqual({})
  })
})

describe('streamOpenAIResponses', () => {
  it('routes reasoning summary deltas to onThinking and keeps them out of the answer', async () => {
    const tokens: string[] = []
    const thinking: string[] = []
    const res = sseResponse(
      sse(
        {
          type: 'response.reasoning_summary_text.delta',
          delta: 'Je réfléchis',
        },
        { type: 'response.reasoning_summary_text.delta', delta: '...' },
        { type: 'response.output_text.delta', delta: 'Réponse' },
      ),
    )
    const result = await streamOpenAIResponses(
      res,
      (t) => tokens.push(t),
      (t) => thinking.push(t),
    )
    expect(tokens).toEqual(['Réponse'])
    expect(thinking).toEqual(['Je réfléchis', '...'])
    expect(result).toMatchObject({
      type: 'text',
      content: 'Réponse',
      thinking: 'Je réfléchis...',
    })
  })

  it('streams text deltas and reads usage and response id', async () => {
    const tokens: string[] = []
    const res = sseResponse(
      sse(
        { type: 'response.output_text.delta', delta: 'Bon' },
        { type: 'response.output_text.delta', delta: 'jour' },
        {
          type: 'response.completed',
          response: { id: 'r1', usage: { input_tokens: 3, output_tokens: 5 } },
        },
      ),
    )
    const result = await streamOpenAIResponses(res, (t) => tokens.push(t))
    expect(tokens).toEqual(['Bon', 'jour'])
    expect(result).toEqual({
      type: 'text',
      content: 'Bonjour',
      usage: { promptTokens: 3, completionTokens: 5 },
    })
  })

  it('returns tool calls with accumulated arguments', async () => {
    const res = sseResponse(
      sse(
        {
          type: 'response.output_item.added',
          item: {
            type: 'function_call',
            id: 'it1',
            call_id: 'c1',
            name: 'search',
          },
        },
        {
          type: 'response.function_call_arguments.delta',
          item_id: 'it1',
          delta: '{"q":',
        },
        {
          type: 'response.function_call_arguments.delta',
          item_id: 'unknown',
          delta: 'ignored',
        },
        {
          type: 'response.function_call_arguments.delta',
          item_id: 'it1',
          delta: '1}',
        },
        { type: 'response.completed', response: { id: 'r2' } },
      ),
    )
    const result = await streamOpenAIResponses(res, () => {})
    expect(result).toEqual({
      type: 'tool_calls',
      calls: [{ id: 'c1', name: 'search', rawArgs: '{"q":1}', args: { q: 1 } }],
      responseId: 'r2',
      usage: undefined,
    })
  })

  it('ignores non-JSON chunks and unrelated events', async () => {
    const res = sseResponse([
      'data: not-json\n\n',
      ...sse({ type: 'other' }, { type: 'response.completed' }),
    ])
    expect(await streamOpenAIResponses(res, () => {})).toEqual({
      type: 'text',
      content: '',
      usage: undefined,
    })
  })

  it('falls back to empty args for invalid tool JSON', async () => {
    const res = sseResponse(
      sse({
        type: 'response.output_item.added',
        item: { type: 'function_call', id: 'i', call_id: 'c', name: 'f' },
      }),
    )
    const result = await streamOpenAIResponses(res, () => {})
    expect(result).toMatchObject({
      type: 'tool_calls',
      calls: [{ args: {}, rawArgs: '' }],
    })
  })

  it('ignores output items that are not function calls', async () => {
    const res = sseResponse(
      sse({
        type: 'response.output_item.added',
        item: { type: 'message', id: 'm' },
      }),
    )
    expect(await streamOpenAIResponses(res, () => {})).toEqual({
      type: 'text',
      content: '',
      usage: undefined,
    })
  })
})

describe('streamChatCompletions (OpenAI style)', () => {
  it('streams content and reads the final usage chunk', async () => {
    const tokens: string[] = []
    const res = sseResponse(
      sse(
        { choices: [{ delta: { content: 'A' } }] },
        { choices: [{ delta: { content: 'B' } }] },
        { choices: [], usage: { prompt_tokens: 2, completion_tokens: 4 } },
        '[DONE]',
      ),
    )
    const result = await streamChatCompletions(res, false, (t) => tokens.push(t))
    expect(tokens).toEqual(['A', 'B'])
    expect(result).toEqual({
      type: 'text',
      content: 'AB',
      usage: { promptTokens: 2, completionTokens: 4 },
    })
  })

  it('accumulates streamed tool calls by index', async () => {
    const res = sseResponse(
      sse(
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: { name: 'search', arguments: '{"q"' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: ':"x"}' } }],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ),
    )
    const result = await streamChatCompletions(res, false, () => {})
    expect(result).toEqual({
      type: 'tool_calls',
      calls: [
        {
          id: 'call_1',
          name: 'search',
          rawArgs: '{"q":"x"}',
          args: { q: 'x' },
        },
      ],
      usage: undefined,
    })
  })

  it('skips chunks without choices and non-JSON chunks', async () => {
    const res = sseResponse(['data: oops\n\n', ...sse({ choices: [] }, { id: 'no-choices' })])
    expect(await streamChatCompletions(res, false, () => {})).toEqual({
      type: 'text',
      content: '',
      usage: undefined,
    })
  })
})
