import type { McpTool } from '../types'
import { addExchange, updateExchange } from '../store/httpStore'

function genId() {
  return Math.random().toString(36).slice(2)
}

interface McpSession {
  sessionId: string | null
  protocolVersion: string
}

const sessions = new Map<string, McpSession>()

function getSession(mcpUrl: string): McpSession | undefined {
  return sessions.get(mcpUrl)
}

function buildHeaders(session: McpSession | undefined, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...extra,
  }
  if (session) {
    headers['MCP-Protocol-Version'] = session.protocolVersion
    if (session.sessionId) {
      headers['Mcp-Session-Id'] = session.sessionId
    }
  }
  return headers
}

async function mcpPost(
  mcpUrl: string,
  body: unknown,
  session?: McpSession,
): Promise<{ status: number; json: Record<string, unknown>; headers: Headers }> {
  const url = mcpUrl.replace(/\/$/, '')
  const exchangeId = genId()
  const reqHeaders = buildHeaders(session)
  addExchange({
    id: exchangeId,
    timestamp: Date.now(),
    type: 'mcp',
    method: 'POST',
    url,
    requestHeaders: reqHeaders,
    requestBody: body,
  })
  const resp = await fetch(url, {
    method: 'POST',
    headers: reqHeaders,
    body: JSON.stringify(body),
  })
  // 202/204 — notifications JSON-RPC sans corps de réponse
  if (resp.status === 202 || resp.status === 204 || resp.headers.get('content-length') === '0') {
    updateExchange(exchangeId, { responseStatus: resp.status, responseBody: null })
    return { status: resp.status, json: {}, headers: resp.headers }
  }
  const json = await resp.json() as Record<string, unknown>
  updateExchange(exchangeId, { responseStatus: resp.status, responseBody: json })
  return { status: resp.status, json, headers: resp.headers }
}

async function mcpJsonRpc(
  mcpUrl: string,
  method: string,
  params: unknown,
  session?: McpSession,
): Promise<unknown> {
  const { status, json } = await mcpPost(mcpUrl, { jsonrpc: '2.0', id: 1, method, params }, session)
  if (status === 404 && session) {
    // Session expirée — forcer une ré-initialisation au prochain appel
    sessions.delete(mcpUrl)
    throw new Error('MCP session expired (404) — please retry')
  }
  if (status < 200 || status >= 300) throw new Error(`MCP HTTP ${status}`)
  if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`)
  return json.result
}

async function mcpInitialize(mcpUrl: string): Promise<McpSession> {
  const existing = getSession(mcpUrl)
  if (existing) return existing

  const { json, headers } = await mcpPost(mcpUrl, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      clientInfo: { name: 'Chat Pédagogique IA', version: '1.0.0' },
      capabilities: {},
    },
  })

  if (json.error) throw new Error(`MCP initialize error: ${JSON.stringify(json.error)}`)

  const result = json.result as Record<string, unknown> | undefined
  const negotiatedVersion =
    (result?.protocolVersion as string | undefined) ?? '2025-11-25'
  const sessionId = headers.get('Mcp-Session-Id') ?? headers.get('mcp-session-id') ?? null

  const session: McpSession = { sessionId, protocolVersion: negotiatedVersion }
  sessions.set(mcpUrl, session)

  // Notification initialized
  await mcpPost(mcpUrl, { jsonrpc: '2.0', method: 'notifications/initialized' }, session)

  return session
}

export async function connectMcp(mcpUrl: string): Promise<void> {
  await mcpInitialize(mcpUrl)
}

export async function disconnectMcp(mcpUrl: string): Promise<void> {
  const session = getSession(mcpUrl)
  try {
    await mcpJsonRpc(mcpUrl, 'shutdown', {}, session).catch(() => { /* shutdown errors are non-fatal */ })
    await mcpPost(mcpUrl, { jsonrpc: '2.0', method: 'exit' }, session)
  } finally {
    sessions.delete(mcpUrl)
  }
}

export async function fetchMcpTools(mcpUrl: string): Promise<McpTool[]> {
  const session = await mcpInitialize(mcpUrl)
  const result = await mcpJsonRpc(mcpUrl, 'tools/list', {}, session) as Record<string, unknown>
  const tools = (result.tools ?? []) as Array<{ name: string; description: string; inputSchema?: unknown }>
  return tools.map(t => ({ name: t.name, description: t.description, enabled: true, inputSchema: t.inputSchema }))
}

export async function callMcpTool(mcpUrl: string, toolName: string, args: Record<string, unknown>): Promise<string> {
  const session = await mcpInitialize(mcpUrl)
  const result = await mcpJsonRpc(mcpUrl, 'tools/call', { name: toolName, arguments: args }, session) as Record<string, unknown>
  const content = result.content
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: string; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('\n')
  }
  return JSON.stringify(result)
}
