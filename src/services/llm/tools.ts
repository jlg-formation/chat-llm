import type { AppConfig, McpTool } from '../../types'
import type { SkillRef } from './types'

export function buildTools(
  skillRefs: SkillRef[],
  mcpTools: McpTool[],
  skillTool: () => unknown,
  mcpTool: (tool: McpTool) => unknown,
): unknown[] {
  return [
    ...(skillRefs.length > 0 ? [skillTool()] : []),
    ...mcpTools.filter((t) => t.enabled).map(mcpTool),
  ]
}

// Schéma invalide → ignoré
export function parseJsonSchema(config: AppConfig): unknown {
  if (!config.jsonSchema) return undefined
  try {
    return JSON.parse(config.jsonSchema)
  } catch {
    return undefined
  }
}

const SKILL_DESCRIPTION =
  "Récupère les instructions complètes d'un skill disponible. Appelle cet outil avant de répondre si tu as besoin des détails d'un skill."
const SKILL_PARAMS = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Nom exact du skill à récupérer' },
  },
  required: ['name'],
}

export function skillToolForResponsesAPI() {
  return {
    type: 'function',
    name: 'get_skill_details',
    description: SKILL_DESCRIPTION,
    parameters: SKILL_PARAMS,
    strict: false,
  }
}

export function skillToolForChatCompletions() {
  return {
    type: 'function',
    function: {
      name: 'get_skill_details',
      description: SKILL_DESCRIPTION,
      parameters: SKILL_PARAMS,
    },
  }
}

function mcpParameters(tool: McpTool): Record<string, unknown> {
  return (
    (tool.inputSchema as Record<string, unknown>) ?? {
      type: 'object',
      properties: {},
    }
  )
}

export function mcpToolForChatCompletions(tool: McpTool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: mcpParameters(tool),
    },
  }
}

export function mcpToolForResponsesAPI(tool: McpTool) {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: mcpParameters(tool),
    strict: false,
  }
}

// Interactions API : outils à plat (name / description / parameters)
export function skillToolForInteractions() {
  return {
    type: 'function',
    name: 'get_skill_details',
    description: SKILL_DESCRIPTION,
    parameters: SKILL_PARAMS,
  }
}

export function mcpToolForInteractions(tool: McpTool) {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: mcpParameters(tool),
  }
}

export function skillToolForAnthropic() {
  return {
    name: 'get_skill_details',
    description: SKILL_DESCRIPTION,
    input_schema: SKILL_PARAMS,
  }
}

// Anthropic exige `type: "object"` à la racine du schéma.
export function mcpToolForAnthropic(tool: McpTool) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { type: 'object', ...mcpParameters(tool) },
  }
}
