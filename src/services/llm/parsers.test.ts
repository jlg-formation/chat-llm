import { describe, it, expect } from 'vitest'
import {
  parseSSEStream,
  safeParseArgs,
  streamOpenAIResponses,
  streamChatCompletions,
  parseNonStreamingResponse,
} from './parsers'
import { sseResponse } from '../../test/fixtures'

const sse = (...payloads: unknown[]) => payloads.map(p => `data: ${typeof p === 'string' ? p : JSON.stringify(p)}\n\n`)

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = []
  for await (const v of gen) out.push(v)
  return out
}

describe('parseSSEStream', () => {
  it('yields data payloads, stops at [DONE] and ignores other lines', async () => {
    const res = sseResponse(['event: x\n', 'data: a\n\n', 'data: b', '\n', 'data: [DONE]\n\n', 'data: after\n'])
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
  it('streams text deltas and reads usage and response id', async () => {
    const tokens: string[] = []
    const res = sseResponse(sse(
      { type: 'response.output_text.delta', delta: 'Bon' },
      { type: 'response.output_text.delta', delta: 'jour' },
      { type: 'response.completed', response: { id: 'r1', usage: { input_tokens: 3, output_tokens: 5 } } },
    ))
    const result = await streamOpenAIResponses(res, t => tokens.push(t))
    expect(tokens).toEqual(['Bon', 'jour'])
    expect(result).toEqual({ type: 'text', content: 'Bonjour', usage: { promptTokens: 3, completionTokens: 5 } })
  })

  it('returns tool calls with accumulated arguments', async () => {
    const res = sseResponse(sse(
      { type: 'response.output_item.added', item: { type: 'function_call', id: 'it1', call_id: 'c1', name: 'search' } },
      { type: 'response.function_call_arguments.delta', item_id: 'it1', delta: '{"q":' },
      { type: 'response.function_call_arguments.delta', item_id: 'unknown', delta: 'ignored' },
      { type: 'response.function_call_arguments.delta', item_id: 'it1', delta: '1}' },
      { type: 'response.completed', response: { id: 'r2' } },
    ))
    const result = await streamOpenAIResponses(res, () => {})
    expect(result).toEqual({
      type: 'tool_calls',
      calls: [{ id: 'c1', name: 'search', rawArgs: '{"q":1}', args: { q: 1 } }],
      responseId: 'r2',
      usage: undefined,
    })
  })

  it('ignores non-JSON chunks and unrelated events', async () => {
    const res = sseResponse(['data: not-json\n\n', ...sse({ type: 'other' }, { type: 'response.completed' })])
    expect(await streamOpenAIResponses(res, () => {})).toEqual({ type: 'text', content: '', usage: undefined })
  })

  it('falls back to empty args for invalid tool JSON', async () => {
    const res = sseResponse(sse(
      { type: 'response.output_item.added', item: { type: 'function_call', id: 'i', call_id: 'c', name: 'f' } },
    ))
    const result = await streamOpenAIResponses(res, () => {})
    expect(result).toMatchObject({ type: 'tool_calls', calls: [{ args: {}, rawArgs: '' }] })
  })

  it('ignores output items that are not function calls', async () => {
    const res = sseResponse(sse({ type: 'response.output_item.added', item: { type: 'message', id: 'm' } }))
    expect(await streamOpenAIResponses(res, () => {})).toEqual({ type: 'text', content: '', usage: undefined })
  })
})

describe('streamChatCompletions (OpenAI style)', () => {
  it('streams content and reads the final usage chunk', async () => {
    const tokens: string[] = []
    const res = sseResponse(sse(
      { choices: [{ delta: { content: 'A' } }] },
      { choices: [{ delta: { content: 'B' } }] },
      { choices: [], usage: { prompt_tokens: 2, completion_tokens: 4 } },
      '[DONE]',
    ))
    const result = await streamChatCompletions(res, false, t => tokens.push(t))
    expect(tokens).toEqual(['A', 'B'])
    expect(result).toEqual({ type: 'text', content: 'AB', usage: { promptTokens: 2, completionTokens: 4 } })
  })

  it('accumulates streamed tool calls by index', async () => {
    const res = sseResponse(sse(
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'search', arguments: '{"q"' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':"x"}' } }] }, finish_reason: 'tool_calls' }] },
    ))
    const result = await streamChatCompletions(res, false, () => {})
    expect(result).toEqual({
      type: 'tool_calls',
      calls: [{ id: 'call_1', name: 'search', rawArgs: '{"q":"x"}', args: { q: 'x' } }],
      usage: undefined,
    })
  })

  it('skips chunks without choices and non-JSON chunks', async () => {
    const res = sseResponse(['data: oops\n\n', ...sse({ choices: [] }, { id: 'no-choices' })])
    expect(await streamChatCompletions(res, false, () => {})).toEqual({ type: 'text', content: '', usage: undefined })
  })
})

describe('streamChatCompletions (Ollama NDJSON)', () => {
  it('streams content and reads eval counts', async () => {
    const tokens: string[] = []
    const body = [
      JSON.stringify({ message: { content: 'Sa' } }),
      '',
      JSON.stringify({ message: { content: 'lut' }, prompt_eval_count: 6, eval_count: 9 }),
    ].join('\n')
    const res = new Response(body)
    const result = await streamChatCompletions(res, true, t => tokens.push(t))
    expect(tokens).toEqual(['Sa', 'lut'])
    expect(result).toEqual({ type: 'text', content: 'Salut', usage: { promptTokens: 6, completionTokens: 9 } })
  })

  it('reads tool calls with string and object arguments', async () => {
    const body = [
      JSON.stringify({ message: { tool_calls: [{ function: { name: 'a', arguments: '{"x":1}' } }, { function: { name: 'b', arguments: { y: 2 } } }] } }),
    ].join('\n')
    const result = await streamChatCompletions(new Response(body), true, () => {})
    expect(result).toEqual({
      type: 'tool_calls',
      calls: [
        { id: 'ollama-tool-0', name: 'a', rawArgs: '{"x":1}', args: { x: 1 } },
        { id: 'ollama-tool-1', name: 'b', rawArgs: '{"y":2}', args: { y: 2 } },
      ],
      usage: undefined,
    })
  })

  it('flushes a trailing line without newline and ignores non-JSON lines', async () => {
    const res = new Response('not json\n' + JSON.stringify({ message: { content: 'fin' } }))
    expect(await streamChatCompletions(res, true, () => {})).toEqual({ type: 'text', content: 'fin', usage: undefined })
  })

  it('skips blank lines between NDJSON records', async () => {
    const res = new Response('\n   \n' + JSON.stringify({ message: { content: 'ok' } }) + '\n')
    expect(await streamChatCompletions(res, true, () => {})).toEqual({ type: 'text', content: 'ok', usage: undefined })
  })
})

describe('parseNonStreamingResponse', () => {
  it('parses a Responses API text answer with usage', () => {
    const json = {
      id: 'r1',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hé' }] }],
      usage: { input_tokens: 1, output_tokens: 2 },
    }
    expect(parseNonStreamingResponse(json, true, false)).toEqual({
      type: 'text',
      content: 'Hé',
      usage: { promptTokens: 1, completionTokens: 2 },
    })
  })

  it('parses Responses API function calls', () => {
    const json = {
      id: 'r2',
      output: [{ type: 'function_call', call_id: 'c', name: 'f', arguments: '{"k":true}' }],
    }
    expect(parseNonStreamingResponse(json, true, false)).toEqual({
      type: 'tool_calls',
      calls: [{ id: 'c', name: 'f', rawArgs: '{"k":true}', args: { k: true } }],
      responseId: 'r2',
      usage: undefined,
    })
  })

  it('tolerates a Responses payload without output or non-text content', () => {
    expect(parseNonStreamingResponse({ id: 'x' }, true, false)).toEqual({ type: 'text', content: '', usage: undefined })
    const json = { output: [{ type: 'message', content: [{ type: 'refusal' }] }] }
    expect(parseNonStreamingResponse(json, true, false)).toEqual({ type: 'text', content: '', usage: undefined })
  })

  it('parses an Ollama text answer and usage', () => {
    const json = { message: { content: 'Ok' }, prompt_eval_count: 4, eval_count: 8 }
    expect(parseNonStreamingResponse(json, false, true)).toEqual({
      type: 'text',
      content: 'Ok',
      usage: { promptTokens: 4, completionTokens: 8 },
    })
  })

  it('parses Ollama tool calls with object and string args', () => {
    const json = {
      message: { tool_calls: [{ function: { name: 'a', arguments: { z: 1 } } }, { function: { name: 'b', arguments: '{"w":2}' } }] },
    }
    expect(parseNonStreamingResponse(json, false, true)).toEqual({
      type: 'tool_calls',
      calls: [
        { id: 'ollama-tool-0', name: 'a', rawArgs: '{"z":1}', args: { z: 1 } },
        { id: 'ollama-tool-1', name: 'b', rawArgs: '{"w":2}', args: { w: 2 } },
      ],
      usage: undefined,
    })
  })

  it('returns empty Ollama text when message content is absent', () => {
    expect(parseNonStreamingResponse({ message: {} }, false, true)).toEqual({ type: 'text', content: '', usage: undefined })
  })

  it('handles Ollama tool calls with missing arguments', () => {
    const json = { message: { tool_calls: [{ function: { name: 'a' } }] } }
    expect(parseNonStreamingResponse(json, false, true)).toMatchObject({
      type: 'tool_calls',
      calls: [{ rawArgs: '{}', args: {} }],
    })
  })

  it('parses Chat Completions tool calls with the raw assistant message', () => {
    const msg = { role: 'assistant', tool_calls: [{ id: 't', function: { name: 'f', arguments: '{}' } }] }
    const json = { choices: [{ finish_reason: 'tool_calls', message: msg }] }
    expect(parseNonStreamingResponse(json, false, false)).toEqual({
      type: 'tool_calls',
      calls: [{ id: 't', name: 'f', rawArgs: '{}', args: {} }],
      rawAssistantMsg: msg,
      usage: undefined,
    })
  })

  it('parses a Chat Completions text answer with usage', () => {
    const json = {
      choices: [{ finish_reason: 'stop', message: { content: 'Bye' } }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    }
    expect(parseNonStreamingResponse(json, false, false)).toEqual({
      type: 'text',
      content: 'Bye',
      usage: { promptTokens: 10, completionTokens: 2 },
    })
  })

  it('returns empty text when a Chat Completions message has no content', () => {
    expect(parseNonStreamingResponse({ choices: [{ message: {} }] }, false, false)).toEqual({
      type: 'text',
      content: '',
      usage: undefined,
    })
  })
})
