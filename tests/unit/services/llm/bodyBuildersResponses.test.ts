import { describe, it, expect } from 'vitest'
import { buildOpenAIResponsesBody } from '@/services/llm/bodyBuilders'
import { makeConfig, makeMessage } from '../../fixtures'
import type { McpTool } from '@/types'

const skill = [{ name: 'demo', description: 'Démo' }]
const mcpTools: McpTool[] = [
  { name: 'on', description: '', enabled: true },
  { name: 'off', description: '', enabled: false },
]

describe('buildOpenAIResponsesBody', () => {
  it('builds input items for each message role', () => {
    const messages = [
      makeMessage({ role: 'user', content: 'hi' }),
      makeMessage({ role: 'assistant', content: 'yo' }),
      makeMessage({
        role: 'tool_call',
        content: '',
        toolCallId: 'c1',
        toolName: 'f',
        toolArgs: '{}',
      }),
      makeMessage({
        role: 'tool_result',
        content: 'out',
        toolCallResultId: 'c1',
      }),
    ]
    const body = buildOpenAIResponsesBody(
      makeConfig({ streamEnabled: true }),
      messages,
      'sys',
      [],
      [],
    ) as { input: unknown[]; instructions: string; store: boolean }
    expect(body.input).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'hi' }],
      },
      { type: 'message', role: 'assistant', content: 'yo' },
      { type: 'function_call', call_id: 'c1', name: 'f', arguments: '{}' },
      { type: 'function_call_output', call_id: 'c1', output: 'out' },
    ])
    expect(body.instructions).toBe('sys')
    expect(body.store).toBe(false)
  })

  it('handles user messages with images and no text, and skips errors', () => {
    const messages = [
      makeMessage({
        role: 'user',
        content: '',
        images: [{ dataUrl: 'data:y', mimeType: 'image/png' }],
      }),
      makeMessage({ role: 'user', content: 'bad', isError: true }),
    ]
    const body = buildOpenAIResponsesBody(makeConfig(), messages, '', [], []) as {
      input: Array<{ content: unknown[] }>
    }
    expect(body.input).toHaveLength(1)
    expect(body.input[0].content).toEqual([{ type: 'input_image', image_url: 'data:y' }])
  })

  it('sends reasoning effort and drops sampling params while reasoning is active', () => {
    const body = buildOpenAIResponsesBody(
      makeConfig({}, { model: 'gpt-5.4', topP: 0.5, temperature: 0.7 }),
      [],
      '',
      [],
      [],
    ) as Record<string, unknown>
    expect(body.reasoning).toEqual({ effort: 'medium', summary: 'auto' })
    expect(body).not.toHaveProperty('top_p')
    expect(body).not.toHaveProperty('temperature')
  })

  it('keeps sampling params when reasoning effort is none', () => {
    const body = buildOpenAIResponsesBody(
      makeConfig({}, { model: 'gpt-5.4', reasoningEffort: 'none', topP: 0.5 }),
      [],
      '',
      [],
      [],
    ) as Record<string, unknown>
    expect(body.reasoning).toEqual({ effort: 'none', summary: 'auto' })
    expect(body.top_p).toBe(0.5)
  })

  it('applies sampling, tools, schema and omits null params', () => {
    const config = makeConfig(
      { jsonSchema: '{"type":"object"}' },
      { topP: 0.5, maxTokens: 42, reasoningEffort: 'none' },
    )
    const body = buildOpenAIResponsesBody(config, [], '', skill, mcpTools) as Record<
      string,
      unknown
    > & { tools: unknown[]; text: unknown }
    expect(body.top_p).toBe(0.5)
    expect(body.max_output_tokens).toBe(42)
    expect(body).not.toHaveProperty('temperature')
    expect(body.tools).toHaveLength(2)
    expect(body.text).toEqual({
      format: {
        type: 'json_schema',
        name: 'output',
        strict: false,
        schema: { type: 'object' },
      },
    })
  })

  it('omits instructions, tools and schema when absent or invalid', () => {
    const body = buildOpenAIResponsesBody(
      makeConfig({ jsonSchema: '{bad' }),
      [],
      '',
      [],
      [],
    ) as Record<string, unknown>
    expect(body).not.toHaveProperty('instructions')
    expect(body).not.toHaveProperty('tools')
    expect(body).not.toHaveProperty('text')
  })
})
