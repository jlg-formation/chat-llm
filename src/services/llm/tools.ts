import type { McpTool } from '../../types'

const SKILL_DESCRIPTION = "Récupère les instructions complètes d'un skill disponible. Appelle cet outil avant de répondre si tu as besoin des détails d'un skill."
const SKILL_PARAMS = {
  type: 'object',
  properties: { name: { type: 'string', description: 'Nom exact du skill à récupérer' } },
  required: ['name'],
}

export function skillToolForResponsesAPI() {
  return { type: 'function', name: 'get_skill_details', description: SKILL_DESCRIPTION, parameters: SKILL_PARAMS, strict: false }
}

export function skillToolForChatCompletions() {
  return { type: 'function', function: { name: 'get_skill_details', description: SKILL_DESCRIPTION, parameters: SKILL_PARAMS } }
}

export function mcpToolForChatCompletions(tool: McpTool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: (tool.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
    },
  }
}

export function mcpToolForResponsesAPI(tool: McpTool) {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: (tool.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
    strict: false,
  }
}
