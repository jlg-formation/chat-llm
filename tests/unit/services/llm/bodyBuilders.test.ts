import { describe, it, expect } from 'vitest'
import { buildChatCompletionsBody, buildOpenAIResponsesBody, buildLmStudioChatBody, buildBody } from '@/services/llm/bodyBuilders'
import { makeConfig, makeMessage } from '../../fixtures'
import type { McpTool } from '@/types'

const skill = [{ name: 'demo', description: 'Démo' }]
const mcpTools: McpTool[] = [
  { name: 'on', description: '', enabled: true },
  { name: 'off', description: '', enabled: false },
]

describe('buildChatCompletionsBody', () => {
  it('builds the full message list and sampling parameters', () => {
    const config = makeConfig({ streamEnabled: true }, { temperature: 0.2, topP: 0.9, maxTokens: 100 })
    const messages = [
      makeMessage({ role: 'user', content: 'hi' }),
      makeMessage({ role: 'assistant', content: 'yo' }),
      makeMessage({ role: 'user', content: 'err', isError: true }),
      makeMessage({ role: 'tool_result', content: 'r', toolCallResultId: 'c1' }),
    ]
    const body = buildChatCompletionsBody(config, messages, 'sys', [], []) as Record<string, unknown>
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'yo' },
      { role: 'tool', tool_call_id: 'c1', content: 'r' },
    ])
    expect(body.stream_options).toEqual({ include_usage: true })
    expect(body.temperature).toBe(0.2)
    expect(body.top_p).toBe(0.9)
    expect(body.max_completion_tokens).toBe(100)
  })

  it('omits null sampling parameters and stream options when not streaming', () => {
    const body = buildChatCompletionsBody(makeConfig({ streamEnabled: false }), [], '', [], []) as Record<string, unknown>
    expect(body).not.toHaveProperty('stream_options')
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('top_p')
    expect(body).not.toHaveProperty('max_completion_tokens')
  })

  it('sends images as multipart content', () => {
    const messages = [makeMessage({ role: 'user', content: 'voici', images: [{ dataUrl: 'data:x', mimeType: 'image/png' }] })]
    const body = buildChatCompletionsBody(makeConfig(), messages, '', [], []) as { messages: unknown[] }
    expect(body.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'voici' },
        { type: 'image_url', image_url: { url: 'data:x' } },
      ],
    })
  })

  it('serializes tool calls as a string for OpenAI-style providers', () => {
    const messages = [makeMessage({ role: 'tool_call', content: '', toolCallId: 't1', toolName: 'search', toolArgs: '{"q":1}' })]
    const body = buildChatCompletionsBody(makeConfig(), messages, '', [], []) as { messages: unknown[] }
    expect(body.messages[0]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 't1', type: 'function', function: { name: 'search', arguments: '{"q":1}' } }],
    })
  })

  it('serializes tool calls as an object for Ollama native and tolerates invalid args', () => {
    const config = makeConfig({}, { apiFormat: 'ollama_chat' })
    const messages = [makeMessage({ role: 'tool_call', content: '', toolCallId: 't1', toolName: 'x', toolArgs: 'not-json' })]
    const body = buildChatCompletionsBody(config, messages, '', [], []) as { messages: Array<{ tool_calls: Array<{ function: { arguments: unknown } }> }> }
    expect(body.messages[0].tool_calls[0].function.arguments).toEqual({})
  })

  it('parses valid tool args for Ollama native', () => {
    const config = makeConfig({}, { apiFormat: 'ollama_chat' })
    const messages = [makeMessage({ role: 'tool_call', content: '', toolCallId: 't1', toolName: 'x', toolArgs: '{"a":2}' })]
    const body = buildChatCompletionsBody(config, messages, '', [], []) as { messages: Array<{ tool_calls: Array<{ function: { arguments: unknown } }> }> }
    expect(body.messages[0].tool_calls[0].function.arguments).toEqual({ a: 2 })
  })

  it('defaults missing tool args to an empty object string', () => {
    const messages = [makeMessage({ role: 'tool_call', content: '', toolCallId: 't1', toolName: 'x' })]
    const body = buildChatCompletionsBody(makeConfig(), messages, '', [], []) as { messages: Array<{ tool_calls: Array<{ function: { arguments: unknown } }> }> }
    expect(body.messages[0].tool_calls[0].function.arguments).toBe('{}')
  })

  it('adds Ollama think=false only for ollama_chat', () => {
    expect(buildChatCompletionsBody(makeConfig({}, { apiFormat: 'ollama_chat' }), [], '', [], [])).toHaveProperty('think', false)
    expect(buildChatCompletionsBody(makeConfig(), [], '', [], [])).not.toHaveProperty('think')
  })

  it('registers skill and enabled MCP tools', () => {
    const body = buildChatCompletionsBody(makeConfig(), [], '', skill, mcpTools) as { tools: Array<{ function: { name: string } }>; tool_choice: string }
    expect(body.tools.map(t => t.function.name)).toEqual(['get_skill_details', 'on'])
    expect(body.tool_choice).toBe('auto')
  })

  it('omits tools when none are available', () => {
    expect(buildChatCompletionsBody(makeConfig(), [], '', [], [])).not.toHaveProperty('tools')
  })

  it('applies a valid JSON schema and ignores an invalid one', () => {
    const valid = buildChatCompletionsBody(makeConfig({ jsonSchema: '{"type":"object"}' }), [], '', [], []) as Record<string, unknown>
    expect(valid.response_format).toEqual({ type: 'json_schema', json_schema: { type: 'object' } })
    const invalid = buildChatCompletionsBody(makeConfig({ jsonSchema: '{bad' }), [], '', [], []) as Record<string, unknown>
    expect(invalid).not.toHaveProperty('response_format')
  })
})

describe('buildOpenAIResponsesBody', () => {
  it('builds input items for each message role', () => {
    const messages = [
      makeMessage({ role: 'user', content: 'hi' }),
      makeMessage({ role: 'assistant', content: 'yo' }),
      makeMessage({ role: 'tool_call', content: '', toolCallId: 'c1', toolName: 'f', toolArgs: '{}' }),
      makeMessage({ role: 'tool_result', content: 'out', toolCallResultId: 'c1' }),
    ]
    const body = buildOpenAIResponsesBody(makeConfig({ streamEnabled: true }), messages, 'sys', [], []) as { input: unknown[]; instructions: string; store: boolean }
    expect(body.input).toEqual([
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
      { type: 'message', role: 'assistant', content: 'yo' },
      { type: 'function_call', call_id: 'c1', name: 'f', arguments: '{}' },
      { type: 'function_call_output', call_id: 'c1', output: 'out' },
    ])
    expect(body.instructions).toBe('sys')
    expect(body.store).toBe(false)
  })

  it('handles user messages with images and no text, and skips errors', () => {
    const messages = [
      makeMessage({ role: 'user', content: '', images: [{ dataUrl: 'data:y', mimeType: 'image/png' }] }),
      makeMessage({ role: 'user', content: 'bad', isError: true }),
    ]
    const body = buildOpenAIResponsesBody(makeConfig(), messages, '', [], []) as { input: Array<{ content: unknown[] }> }
    expect(body.input).toHaveLength(1)
    expect(body.input[0].content).toEqual([{ type: 'input_image', image_url: 'data:y' }])
  })

  it('applies sampling, tools, schema and omits null params', () => {
    const config = makeConfig({ jsonSchema: '{"type":"object"}' }, { topP: 0.5, maxTokens: 42 })
    const body = buildOpenAIResponsesBody(config, [], '', skill, mcpTools) as Record<string, unknown> & { tools: unknown[]; text: unknown }
    expect(body.top_p).toBe(0.5)
    expect(body.max_output_tokens).toBe(42)
    expect(body).not.toHaveProperty('temperature')
    expect(body.tools).toHaveLength(2)
    expect(body.text).toEqual({ format: { type: 'json_schema', name: 'output', strict: false, schema: { type: 'object' } } })
  })

  it('omits instructions, tools and schema when absent or invalid', () => {
    const body = buildOpenAIResponsesBody(makeConfig({ jsonSchema: '{bad' }), [], '', [], []) as Record<string, unknown>
    expect(body).not.toHaveProperty('instructions')
    expect(body).not.toHaveProperty('tools')
    expect(body).not.toHaveProperty('text')
  })
})

describe('buildLmStudioChatBody', () => {
  it('sends only the last user turn with images', () => {
    const messages = [
      makeMessage({ role: 'user', content: 'premier' }),
      makeMessage({ role: 'assistant', content: 'ok' }),
      makeMessage({ role: 'user', content: 'dernier', images: [{ dataUrl: 'data:z', mimeType: 'image/png' }] }),
    ]
    const body = buildLmStudioChatBody(makeConfig({ streamEnabled: true }), messages, 'sys', 'resp-1') as Record<string, unknown>
    expect(body.input).toEqual([
      { type: 'text', content: 'dernier' },
      { type: 'image', data_url: 'data:z' },
    ])
    expect(body.previous_response_id).toBe('resp-1')
    expect(body.system_prompt).toBe('sys')
    expect(body.store).toBe(true)
  })

  it('ignores errored user messages and sends an empty input when none remain', () => {
    const messages = [makeMessage({ role: 'user', content: 'x', isError: true })]
    const body = buildLmStudioChatBody(makeConfig(), messages, '') as Record<string, unknown>
    expect(body.input).toEqual([])
    expect(body).not.toHaveProperty('previous_response_id')
    expect(body).not.toHaveProperty('system_prompt')
  })

  it('skips an empty user text but keeps images', () => {
    const messages = [makeMessage({ role: 'user', content: '', images: [{ dataUrl: 'data:i', mimeType: 'image/png' }] })]
    const body = buildLmStudioChatBody(makeConfig(), messages, '') as { input: unknown[] }
    expect(body.input).toEqual([{ type: 'image', data_url: 'data:i' }])
  })

  it('applies sampling parameters when set', () => {
    const body = buildLmStudioChatBody(makeConfig({}, { temperature: 0.1, topP: 0.2, maxTokens: 7 }), [], '') as Record<string, unknown>
    expect(body.temperature).toBe(0.1)
    expect(body.top_p).toBe(0.2)
    expect(body.max_output_tokens).toBe(7)
  })

  it('declares one integration per enabled MCP server with allowed tools', () => {
    const config = makeConfig({
      mcpServers: [
        { id: '1', name: 'Alpha', url: 'http://a', enabled: true, tools: [{ name: 't1', description: '', enabled: true }, { name: 't2', description: '', enabled: false }] },
        { id: '2', name: '', url: 'http://b', enabled: true, tools: [{ name: 't3', description: '', enabled: false }] },
        { id: '3', name: 'Off', url: 'http://c', enabled: false, tools: [] },
        { id: '4', name: 'NoUrl', url: '', enabled: true, tools: [] },
      ],
    })
    const body = buildLmStudioChatBody(config, [], '') as { integrations: unknown[] }
    expect(body.integrations).toEqual([
      { type: 'plugin', id: 'mcp/Alpha', allowed_tools: ['t1'] },
      { type: 'plugin', id: 'mcp/2' },
    ])
  })

  it('omits integrations when no server is enabled', () => {
    expect(buildLmStudioChatBody(makeConfig(), [], '')).not.toHaveProperty('integrations')
  })
})

describe('buildBody', () => {
  it('routes to the LM Studio builder', () => {
    const body = buildBody(makeConfig({}, { apiFormat: 'lmstudio_chat' }), [], '', [], [], { previousResponseId: 'p' }) as Record<string, unknown>
    expect(body.previous_response_id).toBe('p')
    expect(body).toHaveProperty('store', true)
  })

  it('routes to the Responses builder', () => {
    const body = buildBody(makeConfig({}, { apiFormat: 'responses' }), [], '', [], []) as Record<string, unknown>
    expect(body).toHaveProperty('store', false)
  })

  it('routes to the Chat Completions builder otherwise', () => {
    const body = buildBody(makeConfig({}, { apiFormat: 'chat_completions' }), [], '', [], []) as Record<string, unknown>
    expect(body).toHaveProperty('messages')
  })
})
