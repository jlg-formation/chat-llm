import { describe, it, expect } from 'vitest'
import {
  skillToolForResponsesAPI,
  skillToolForChatCompletions,
  mcpToolForChatCompletions,
  mcpToolForResponsesAPI,
} from '@/services/llm/tools'
import type { McpTool } from '@/types'

const schema = { type: 'object', properties: { q: { type: 'string' } } }
const tool: McpTool = { name: 'search', description: 'Cherche', enabled: true, inputSchema: schema }
const bare: McpTool = { name: 'ping', description: 'Ping', enabled: true }

describe('tool definitions', () => {
  it('describes the skill tool for the Responses API', () => {
    const def = skillToolForResponsesAPI()
    expect(def.type).toBe('function')
    expect(def.name).toBe('get_skill_details')
    expect(def.strict).toBe(false)
  })

  it('describes the skill tool for Chat Completions', () => {
    const def = skillToolForChatCompletions()
    expect(def.function.name).toBe('get_skill_details')
    expect(def.function.parameters.required).toEqual(['name'])
  })

  it('maps an MCP tool for Chat Completions', () => {
    expect(mcpToolForChatCompletions(tool)).toEqual({
      type: 'function',
      function: { name: 'search', description: 'Cherche', parameters: schema },
    })
  })

  it('maps an MCP tool for the Responses API', () => {
    expect(mcpToolForResponsesAPI(tool)).toEqual({
      type: 'function',
      name: 'search',
      description: 'Cherche',
      parameters: schema,
      strict: false,
    })
  })

  it('falls back to an empty object schema when none is provided', () => {
    expect(mcpToolForChatCompletions(bare).function.parameters).toEqual({
      type: 'object',
      properties: {},
    })
    expect(mcpToolForResponsesAPI(bare).parameters).toEqual({ type: 'object', properties: {} })
  })
})
