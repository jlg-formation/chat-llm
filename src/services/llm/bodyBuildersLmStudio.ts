import type { AppConfig, ChatMessage } from '../../types'
import { applySampling } from './bodyBuildersSampling'

export function buildLmStudioChatBody(
  config: AppConfig,
  messages: ChatMessage[],
  systemPrompt: string,
  previousResponseId?: string,
) {
  // Trouver le dernier message utilisateur (le tour courant)
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user' && !m.isError)

  // input = liste d'items {type:"text"|"image"} du tour courant uniquement
  const input: unknown[] = []
  if (lastUserMsg) {
    if (lastUserMsg.content) input.push({ type: 'text', content: lastUserMsg.content })
    for (const img of lastUserMsg.images ?? []) input.push({ type: 'image', data_url: img.dataUrl })
  }

  const body: Record<string, unknown> = {
    model: config.llm.model,
    input,
    stream: config.streamEnabled,
    store: true,
  }

  if (previousResponseId) body.previous_response_id = previousResponseId
  if (systemPrompt) body.system_prompt = systemPrompt
  applySampling(body, config, 'max_output_tokens')

  // Intégration MCP via ephemeral_mcp (format natif LM Studio) — un plugin par serveur actif
  const enabledServers = config.mcpServers.filter((s) => s.enabled && s.url)
  if (enabledServers.length > 0) {
    body.integrations = enabledServers.map((server) => {
      const enabledTools = server.tools.filter((t) => t.enabled)
      const integration: Record<string, unknown> = {
        type: 'plugin',
        id: `mcp/${server.name || server.id}`,
      }
      if (enabledTools.length > 0) integration.allowed_tools = enabledTools.map((t) => t.name)
      return integration
    })
  }

  return body
}
