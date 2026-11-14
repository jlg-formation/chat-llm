import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { sendMessage } from '@/services/llm/index'
import { useHttpExchanges, clearExchanges } from '@/store/httpStore'
import { makeConfig, makeMessage, sseResponse, jsonResponse } from '../../fixtures'

const fetchMock = vi.fn()
const readExchanges = () => renderHook(() => useHttpExchanges()).result.current[0]

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  clearExchanges()
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

const messages = [makeMessage({ role: 'user', content: 'Bonjour' })]
const config = (streamEnabled: boolean) =>
  makeConfig(
    { streamEnabled },
    {
      provider: 'anthropic',
      apiFormat: 'anthropic_messages',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-haiku-5-5',
      showThinking: true,
      apiKeys: { openai: '', anthropic: 'sk-ant-secret-key', ovh: '', lmstudio: '', ollama: '' },
    },
  )

const ev = (type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`

describe('sendMessage with Anthropic native format', () => {
  it('streams thinking and text, and logs a masked exchange with the thinking', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        ev('message_start', { message: { usage: { input_tokens: 3, output_tokens: 1 } } }),
        ev('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }),
        ev('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } }),
        ev('content_block_start', { index: 1, content_block: { type: 'text', text: '' } }),
        ev('content_block_delta', { index: 1, delta: { type: 'text_delta', text: 'Salut' } }),
        ev('message_delta', { usage: { output_tokens: 2 } }),
      ]),
    )
    const tokens: string[] = []
    const thoughts: string[] = []
    const result = await sendMessage(
      config(true), messages, '', [], [],
      (t) => tokens.push(t), undefined, undefined, (t) => thoughts.push(t),
    )

    expect(tokens).toEqual(['Salut'])
    expect(thoughts).toEqual(['hmm'])
    expect(result).toMatchObject({ type: 'text', content: 'Salut', thinking: 'hmm' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'sk-ant-secret-key' }),
      }),
    )

    const logged = readExchanges()[0]
    expect(logged.requestHeaders['x-api-key']).toBe('sk-ant-s…')
    expect(logged.responseBody).toEqual({ streaming_response: 'Salut', thinking: 'hmm' })
  })

  it('logs tool calls with the thinking when streaming', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        ev('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }),
        ev('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'plan' } }),
        ev('content_block_start', { index: 1, content_block: { type: 'tool_use', id: 't', name: 'n', input: {} } }),
      ]),
    )
    const result = await sendMessage(config(true), messages, '', [], [], () => {})
    expect(result.type).toBe('tool_calls')
    const logged = readExchanges()[0]
    expect(logged.responseBody).toMatchObject({ thinking: 'plan', tool_calls: [{ id: 't' }] })
  })

  it('parses a non-streaming answer', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { content: [{ type: 'text', text: 'Ok' }], usage: { input_tokens: 1, output_tokens: 1 } },
        200,
        { 'request-id': 'req_1' },
      ),
    )
    const result = await sendMessage(config(false), messages, '', [], [], () => {})
    expect(result).toEqual({
      type: 'text',
      content: 'Ok',
      thinking: undefined,
      usage: { promptTokens: 1, completionTokens: 1 },
    })
  })

  it('throws with the HTTP status and body on errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"bad"}', { status: 400 }))
    await expect(sendMessage(config(false), messages, '', [], [], () => {})).rejects.toThrow(
      'HTTP 400: {"error":"bad"}',
    )
  })
})
