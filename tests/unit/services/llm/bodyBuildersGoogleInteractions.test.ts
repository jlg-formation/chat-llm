import { describe, it, expect } from 'vitest'
import {
  buildGoogleInteractionsBody,
  buildGoogleInteractionsInput,
} from '@/services/llm/bodyBuildersGoogleInteractions'
import { makeConfig, makeMessage } from '../../fixtures'

describe('buildGoogleInteractionsInput', () => {
  it('sends only the last user message as text', () => {
    const input = buildGoogleInteractionsInput([
      makeMessage({ role: 'user', content: 'premier' }),
      makeMessage({ role: 'assistant', content: 'réponse' }),
      makeMessage({ role: 'user', content: 'second' }),
    ])
    expect(input).toEqual([{ type: 'text', text: 'second' }])
  })

  it('converts tool results into function_result steps with the tool name', () => {
    const input = buildGoogleInteractionsInput([
      makeMessage({ role: 'user', content: 'calcule' }),
      makeMessage({
        role: 'tool_call',
        content: '',
        toolCallId: 'c1',
        toolName: 'add',
      }),
      makeMessage({
        role: 'tool_result',
        content: '5',
        toolCallResultId: 'c1',
      }),
    ])
    expect(input).toEqual([
      {
        type: 'function_result',
        name: 'add',
        call_id: 'c1',
        result: [{ type: 'text', text: '5' }],
      },
    ])
  })

  it('converts data URL images to inline image content', () => {
    const input = buildGoogleInteractionsInput([
      makeMessage({
        role: 'user',
        content: 'vois',
        images: [{ dataUrl: 'data:image/png;base64,AAA=' }] as never,
      }),
    ])
    expect(input).toEqual([
      { type: 'text', text: 'vois' },
      { type: 'image', data: 'AAA=', mime_type: 'image/png' },
    ])
  })
})

describe('buildGoogleInteractionsBody', () => {
  it('sets store, stream, system instruction and previous interaction id', () => {
    const config = makeConfig(
      { streamEnabled: true },
      { apiFormat: 'google_interactions', model: 'gemini-x' },
    )
    const body = buildGoogleInteractionsBody(
      config,
      [makeMessage({ role: 'user', content: 'hi' })],
      'Sois bref',
      [],
      [],
      'prev-1',
    )
    expect(body).toMatchObject({
      model: 'gemini-x',
      stream: true,
      store: true,
      system_instruction: 'Sois bref',
      previous_interaction_id: 'prev-1',
      input: [{ type: 'text', text: 'hi' }],
    })
    expect(body).not.toHaveProperty('tools')
  })

  it('omits previous_interaction_id and null sampling parameters', () => {
    const config = makeConfig(
      {},
      {
        apiFormat: 'google_interactions',
        temperature: 0.4,
        topP: null,
        maxTokens: null,
      },
    )
    const body = buildGoogleInteractionsBody(
      config,
      [makeMessage({ role: 'user', content: 'x' })],
      '',
      [],
      [],
    )
    expect(body).not.toHaveProperty('previous_interaction_id')
    expect(body).not.toHaveProperty('system_instruction')
    expect(body.generation_config).toEqual({
      temperature: 0.4,
      thinking_summaries: 'none',
    })
  })

  it('sends thinking_level and summaries for a model with thinking levels', () => {
    const config = makeConfig(
      {},
      {
        apiFormat: 'google_interactions',
        model: 'gemini-3.8-flash',
        showThinking: true,
        reasoningEffort: 'high',
      },
    )
    const body = buildGoogleInteractionsBody(
      config,
      [makeMessage({ role: 'user', content: 'x' })],
      '',
      [],
      [],
    )
    expect(body.generation_config).toEqual({
      thinking_level: 'high',
      thinking_summaries: 'auto',
    })
  })

  it('omits thinking_level on api default and disables summaries when Thinking is off', () => {
    const config = makeConfig(
      {},
      {
        apiFormat: 'google_interactions',
        model: 'gemini-3.8-flash',
        showThinking: false,
        reasoningEffort: null,
      },
    )
    const body = buildGoogleInteractionsBody(
      config,
      [makeMessage({ role: 'user', content: 'x' })],
      '',
      [],
      [],
    )
    expect(body.generation_config).toEqual({ thinking_summaries: 'none' })
  })

  it('drops a level unsupported by the model', () => {
    const config = makeConfig(
      {},
      {
        apiFormat: 'google_interactions',
        model: 'gemini-3-pro-preview',
        reasoningEffort: 'minimal',
      },
    )
    const body = buildGoogleInteractionsBody(
      config,
      [makeMessage({ role: 'user', content: 'x' })],
      '',
      [],
      [],
    )
    expect(body.generation_config).not.toHaveProperty('thinking_level')
  })

  it('sends no thinking fields for an unlisted model', () => {
    const config = makeConfig(
      {},
      {
        apiFormat: 'google_interactions',
        model: 'gemini-unknown',
        showThinking: true,
        reasoningEffort: 'high',
      },
    )
    const body = buildGoogleInteractionsBody(
      config,
      [makeMessage({ role: 'user', content: 'x' })],
      '',
      [],
      [],
    )
    expect(body).not.toHaveProperty('generation_config')
  })
})
