import { describe, it, expect } from 'vitest'
import { buildOpenAIResponsesBody } from '@/services/llm/bodyBuilders'
import { parseNonStreamingResponse, streamOpenAIResponses } from '@/services/llm/parsers'
import { webSearchActive, webSearchAvailable } from '@/services/llm/helpers'
import { makeConfig, makeMessage, sseResponse } from '../../fixtures'

const userMsg = [makeMessage({ role: 'user', content: 'Quoi de neuf ?' })]

const searchOutput = [
  { type: 'web_search_call', id: 'ws1', status: 'completed', action: { query: 'actualité IA' } },
  {
    type: 'message',
    content: [
      {
        type: 'output_text',
        text: 'Résultat',
        annotations: [
          { type: 'url_citation', url: 'https://a.example', title: 'A' },
          { type: 'url_citation', url: 'https://a.example', title: 'A' },
        ],
      },
    ],
  },
]

describe('hosted web search helpers', () => {
  it('is available only for openai + responses', () => {
    expect(webSearchAvailable(makeConfig())).toBe(true)
    expect(webSearchAvailable(makeConfig({}, { provider: 'ovh' }))).toBe(false)
    expect(
      webSearchAvailable(makeConfig({}, { provider: 'openai', apiFormat: 'chat_completions' })),
    ).toBe(false)
  })

  it('is active only when the flag is on and available', () => {
    expect(webSearchActive(makeConfig())).toBe(false)
    expect(webSearchActive(makeConfig({ hostedTools: { webSearch: true } }))).toBe(true)
    expect(
      webSearchActive(makeConfig({ hostedTools: { webSearch: true } }, { provider: 'ovh' })),
    ).toBe(false)
  })
})

describe('buildOpenAIResponsesBody with web search', () => {
  it('adds the web_search tool when active', () => {
    const config = makeConfig({ hostedTools: { webSearch: true } })
    const body = buildOpenAIResponsesBody(config, userMsg, '', [], []) as Record<string, unknown>
    expect(body.tools).toEqual([{ type: 'web_search' }])
  })

  it('omits tools when the flag is off', () => {
    const body = buildOpenAIResponsesBody(makeConfig(), userMsg, '', [], []) as Record<
      string,
      unknown
    >
    expect(body.tools).toBeUndefined()
  })
})

describe('hosted activity parsing', () => {
  it('extracts searches and deduplicated sources from a non-streaming response', () => {
    const json = { id: 'r1', output: searchOutput }
    const result = parseNonStreamingResponse(json, true, false)
    expect(result).toMatchObject({
      type: 'text',
      content: 'Résultat',
      hosted: {
        searches: ['actualité IA'],
        sources: [
          { url: 'https://a.example', title: 'A' },
          { url: 'https://a.example', title: 'A' },
        ],
      },
    })
  })

  it('omits hosted when no web search happened', () => {
    const json = {
      id: 'r2',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hé' }] }],
    }
    expect(parseNonStreamingResponse(json, true, false)).not.toHaveProperty('hosted')
  })

  it('extracts hosted activity from a streamed response.completed event', async () => {
    const completed = {
      type: 'response.completed',
      response: { id: 'r3', output: searchOutput },
    }
    const res = sseResponse([
      `event: response.completed\ndata: ${JSON.stringify(completed)}\n\n`,
    ])
    const result = await streamOpenAIResponses(res, () => {})
    expect(result).toMatchObject({
      hosted: {
        searches: ['actualité IA'],
        sources: [
          { url: 'https://a.example', title: 'A' },
          { url: 'https://a.example', title: 'A' },
        ],
      },
    })
  })
})
