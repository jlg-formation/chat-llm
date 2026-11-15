import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendMessage } from '@/services/llm/index'
import { makeConfig, makeMessage, sseResponse, jsonResponse } from '../../fixtures'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

const messages = [makeMessage({ role: 'user', content: 'Bonjour' })]

describe('sendMessage', () => {
  it('streams a Responses API answer', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse(['data: {"type":"response.output_text.delta","delta":"Yo"}\n\n']),
    )
    const tokens: string[] = []
    const result = await sendMessage(makeConfig(), messages, '', [], [], (t) => tokens.push(t))
    expect(tokens).toEqual(['Yo'])
    expect(result).toEqual({ type: 'text', content: 'Yo', usage: undefined })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('uses the non-streaming Chat Completions path when streaming is off', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ finish_reason: 'stop', message: { content: 'Salut' } }],
      }),
    )
    const config = makeConfig(
      { streamEnabled: false },
      { apiFormat: 'chat_completions', baseUrl: 'http://x' },
    )
    const result = await sendMessage(config, messages, '', [], [], () => {})
    expect(result).toEqual({ type: 'text', content: 'Salut', usage: undefined })
    expect(fetchMock).toHaveBeenCalledWith('http://x/v1/chat/completions', expect.anything())
  })

  it('streams LM Studio chat and forwards the previous response id', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'event: message.delta\ndata: {"content":"A"}\n\n',
        'event: chat.end\ndata: {"response_id":"next"}\n\n',
      ]),
    )
    const config = makeConfig({}, { apiFormat: 'lmstudio_chat', baseUrl: 'http://lm' })
    const result = await sendMessage(config, messages, '', [], [], () => {}, undefined, 'prev')
    expect(result).toEqual({ type: 'text', content: 'A', usage: undefined, responseId: 'next' })
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(sentBody.previous_response_id).toBe('prev')
  })

  it('reads a non-streaming LM Studio answer', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ output: [{ type: 'message', content: 'Hi' }], response_id: 'r' }),
    )
    const config = makeConfig(
      { streamEnabled: false },
      { apiFormat: 'lmstudio_chat', baseUrl: 'http://lm' },
    )
    const result = await sendMessage(config, messages, '', [], [], () => {})
    expect(result).toMatchObject({ type: 'text', content: 'Hi', responseId: 'r' })
  })

  it('streams Ollama native answers', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: 'Ola' } })))
    const config = makeConfig(
      {},
      { apiFormat: 'ollama_chat', baseUrl: 'http://ol', provider: 'ollama' },
    )
    const result = await sendMessage(config, messages, '', [], [], () => {})
    expect(result).toEqual({ type: 'text', content: 'Ola', usage: undefined })
  })

  it('reads non-streaming Ollama answers', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: { content: 'Ok' } }))
    const config = makeConfig(
      { streamEnabled: false },
      { apiFormat: 'ollama_chat', baseUrl: 'http://ol', provider: 'ollama' },
    )
    const result = await sendMessage(config, messages, '', [], [], () => {})
    expect(result).toEqual({ type: 'text', content: 'Ok', usage: undefined })
  })

  it('reads non-streaming Responses API answers', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'r1',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Re' }] }],
      }),
    )
    const config = makeConfig({ streamEnabled: false })
    const result = await sendMessage(config, messages, '', [], [], () => {})
    expect(result).toEqual({ type: 'text', content: 'Re', usage: undefined })
  })

  it('throws with the HTTP status and body on failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('quota exceeded', { status: 429 }))
    await expect(sendMessage(makeConfig(), messages, '', [], [], () => {})).rejects.toThrow(
      'HTTP 429: quota exceeded',
    )
  })

  it('returns tool calls from a streamed answer', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c","function":{"name":"f","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      ]),
    )
    const config = makeConfig({}, { apiFormat: 'chat_completions' })
    const result = await sendMessage(config, messages, '', [], [], () => {})
    expect(result).toMatchObject({ type: 'tool_calls', calls: [{ id: 'c', name: 'f' }] })
  })
})
