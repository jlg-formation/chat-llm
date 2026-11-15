import { describe, it, expect } from 'vitest'
import { buildAnthropicBody } from '@/services/llm/bodyBuildersAnthropic'
import { parseAnthropicNonStreaming } from '@/services/llm/parsersAnthropic'
import { webSearchAvailable } from '@/services/llm/helpers'
import { makeConfig, makeMessage } from '../../fixtures'

const anthropicCfg = (hosted = false) =>
  makeConfig(
    { hostedTools: { webSearch: hosted } },
    { provider: 'anthropic', apiFormat: 'anthropic_messages' },
  )

const userMsg = [makeMessage({ role: 'user', content: 'Quoi de neuf ?' })]

const searchContent = [
  { type: 'text', text: 'Je cherche.' },
  {
    type: 'server_tool_use',
    id: 'srv1',
    name: 'web_search',
    input: { query: 'actualité IA' },
  },
  {
    type: 'web_search_tool_result',
    tool_use_id: 'srv1',
    content: [
      { type: 'web_search_result', url: 'https://a.example', title: 'A' },
      { type: 'web_search_result', url: 'https://b.example', title: 'B' },
    ],
  },
  { type: 'text', text: 'Voici la réponse.' },
]

describe('anthropic web search availability', () => {
  it('is available for anthropic + anthropic_messages only', () => {
    expect(webSearchAvailable(anthropicCfg())).toBe(true)
    expect(
      webSearchAvailable(makeConfig({}, { provider: 'anthropic', apiFormat: 'chat_completions' })),
    ).toBe(false)
  })
})

describe('buildAnthropicBody with web search', () => {
  it('adds the web_search_20250305 tool when active', () => {
    const body = buildAnthropicBody(anthropicCfg(true), userMsg, '', [], [])
    expect(body.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search' }])
  })

  it('omits tools when the flag is off', () => {
    const body = buildAnthropicBody(anthropicCfg(false), userMsg, '', [], [])
    expect(body.tools).toBeUndefined()
  })
})

describe('anthropic hosted activity parsing', () => {
  it('extracts queries and deduplicated sources', () => {
    const json = {
      content: [...searchContent, { type: 'text', text: 'Autre' }],
      stop_reason: 'end_turn',
    }
    const result = parseAnthropicNonStreaming(json)
    expect(result).toMatchObject({
      type: 'text',
      hosted: {
        searches: ['actualité IA'],
        sources: [
          { url: 'https://a.example', title: 'A' },
          { url: 'https://b.example', title: 'B' },
        ],
      },
    })
    expect(result.type === 'text' && result.pausedContent).toBeUndefined()
  })

  it('returns pausedContent on pause_turn so the turn can be replayed', () => {
    const result = parseAnthropicNonStreaming({
      content: searchContent,
      stop_reason: 'pause_turn',
    })
    expect(result).toMatchObject({ type: 'text', pausedContent: searchContent })
  })

  it('keeps server blocks for replay alongside tool_use calls', () => {
    const json = {
      content: [
        ...searchContent.slice(1, 3),
        { type: 'tool_use', id: 't1', name: 'lookup', input: { q: 'x' } },
      ],
      stop_reason: 'tool_use',
    }
    const result = parseAnthropicNonStreaming(json)
    expect(result).toMatchObject({
      type: 'tool_calls',
      thinkingBlocks: searchContent.slice(1, 3),
      calls: [{ id: 't1', name: 'lookup' }],
    })
  })

  it('omits hosted when no web search happened', () => {
    const result = parseAnthropicNonStreaming({
      content: [{ type: 'text', text: 'Hé' }],
      stop_reason: 'end_turn',
    })
    expect(result.hosted).toBeUndefined()
  })
})
