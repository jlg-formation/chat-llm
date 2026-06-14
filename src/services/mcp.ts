import type { McpTool } from '../types'
import { addExchange, updateExchange } from '../store/httpStore'

function genId() {
  return Math.random().toString(36).slice(2)
}

async function mcpPost(mcpUrl: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const url = mcpUrl.replace(/\/$/, '')
  const exchangeId = genId()
  addExchange({
    id: exchangeId,
    timestamp: Date.now(),
    type: 'mcp',
    method: 'POST',
    url,
    requestHeaders: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    requestBody: body,
  })
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  })
  // 204 No Content — notifications JSON-RPC sans corps de réponse
  if (resp.status === 204 || resp.headers.get('content-length') === '0') {
    updateExchange(exchangeId, { responseStatus: resp.status, responseBody: null })
    return { status: resp.status, json: {} }
  }
  const json = await resp.json() as Record<string, unknown>
  updateExchange(exchangeId, { responseStatus: resp.status, responseBody: json })
  return { status: resp.status, json }
}

async function mcpJsonRpc(mcpUrl: string, method: string, params: unknown): Promise<unknown> {
  const { status, json } = await mcpPost(mcpUrl, { jsonrpc: '2.0', id: 1, method, params })
  if (status < 200 || status >= 300) throw new Error(`MCP HTTP ${status}`)
  if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`)
  return json.result
}

async function mcpInitialize(mcpUrl: string): Promise<void> {
  await mcpJsonRpc(mcpUrl, 'initialize', {
    protocolVersion: '2025-03-26',
    clientInfo: { name: 'Chat Pédagogique IA', version: '1.0.0' },
    capabilities: {},
  })
  // Notification initialized — pas de réponse attendue (id absent = notification JSON-RPC)
  await mcpPost(mcpUrl, { jsonrpc: '2.0', method: 'notifications/initialized' })
}

export async function connectMcp(mcpUrl: string): Promise<void> {
  await mcpInitialize(mcpUrl)
}

export async function disconnectMcp(mcpUrl: string): Promise<void> {
  await mcpJsonRpc(mcpUrl, 'shutdown', {})
  // Notification exit — le serveur peut terminer proprement
  await mcpPost(mcpUrl, { jsonrpc: '2.0', method: 'exit' })
}

export async function fetchMcpTools(mcpUrl: string): Promise<McpTool[]> {
  await mcpInitialize(mcpUrl)
  const result = await mcpJsonRpc(mcpUrl, 'tools/list', {}) as Record<string, unknown>
  const tools = (result.tools ?? []) as Array<{ name: string; description: string; inputSchema?: unknown }>
  return tools.map(t => ({ name: t.name, description: t.description, enabled: true, inputSchema: t.inputSchema }))
}

export async function callMcpTool(mcpUrl: string, toolName: string, args: Record<string, unknown>): Promise<string> {
  await mcpInitialize(mcpUrl)
  const result = await mcpJsonRpc(mcpUrl, 'tools/call', { name: toolName, arguments: args }) as Record<string, unknown>
  const content = result.content
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: string; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('\n')
  }
  return JSON.stringify(result)
}
