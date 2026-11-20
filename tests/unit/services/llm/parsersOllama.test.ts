import { describe, it, expect } from 'vitest'
import { streamChatCompletions } from '@/services/llm/parsers'

describe('streamChatCompletions (Ollama NDJSON)', () => {
  it('streams content and reads eval counts', async () => {
    const tokens: string[] = []
    const body = [
      JSON.stringify({ message: { content: 'Sa' } }),
      '',
      JSON.stringify({
        message: { content: 'lut' },
        prompt_eval_count: 6,
        eval_count: 9,
      }),
    ].join('\n')
    const res = new Response(body)
    const result = await streamChatCompletions(res, true, (t) => tokens.push(t))
    expect(tokens).toEqual(['Sa', 'lut'])
    expect(result).toEqual({
      type: 'text',
      content: 'Salut',
      usage: { promptTokens: 6, completionTokens: 9 },
    })
  })

  it('reads tool calls with string and object arguments', async () => {
    const body = [
      JSON.stringify({
        message: {
          tool_calls: [
            { function: { name: 'a', arguments: '{"x":1}' } },
            { function: { name: 'b', arguments: { y: 2 } } },
          ],
        },
      }),
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
    expect(await streamChatCompletions(res, true, () => {})).toEqual({
      type: 'text',
      content: 'fin',
      usage: undefined,
    })
  })

  it('skips blank lines between NDJSON records', async () => {
    const res = new Response('\n   \n' + JSON.stringify({ message: { content: 'ok' } }) + '\n')
    expect(await streamChatCompletions(res, true, () => {})).toEqual({
      type: 'text',
      content: 'ok',
      usage: undefined,
    })
  })
})
