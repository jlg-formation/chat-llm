import type { McpServer, McpTool } from '../types'
import { addExchange, updateExchange } from '../store/httpStore'
import { parseSSEEvents } from './sse'
import { genId } from './id'

type McpConnection = Pick<McpServer, 'url' | 'token'>

const MCP_TIMEOUT_MS = 15_000

let rpcIdCounter = 0
function nextRpcId(): number {
  rpcIdCounter += 1
  return rpcIdCounter
}

interface McpSession {
  sessionId: string | null
  protocolVersion: string
}

const sessions = new Map<string, McpSession>()

function getSession(mcpUrl: string): McpSession | undefined {
  return sessions.get(mcpUrl)
}

function buildHeaders(session: McpSession | undefined, token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (session) {
    headers['MCP-Protocol-Version'] = session.protocolVersion
    if (session.sessionId) {
      headers['Mcp-Session-Id'] = session.sessionId
    }
  }
  return headers
}

function maskAuthorization(headers: Record<string, string>): Record<string, string> {
  return headers.Authorization ? { ...headers, Authorization: 'Bearer ***' } : headers
}

/**
 * Envoie une requête MCP avec timeout et la journalise dans httpStore.
 * `readBody` extrait le corps de la réponse (null = pas de corps).
 */
async function mcpFetch(
  conn: McpConnection,
  method: 'POST' | 'DELETE',
  session: McpSession | undefined,
  body: unknown,
  readBody: (resp: Response) => Promise<Record<string, unknown> | null>,
): Promise<{ resp: Response; json: Record<string, unknown> | null }> {
  const url = conn.url.replace(/\/$/, '')
  const exchangeId = genId()
  const reqHeaders = buildHeaders(session, conn.token)
  addExchange({
    id: exchangeId,
    timestamp: Date.now(),
    type: 'mcp',
    method,
    url,
    requestHeaders: maskAuthorization(reqHeaders),
    requestBody: body ?? null,
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS)
  try {
    const resp = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const json = await readBody(resp)
    updateExchange(exchangeId, {
      responseStatus: resp.status,
      responseHeaders: {
        'content-type': resp.headers.get('content-type') ?? '',
      },
      responseBody: json,
    })
    return { resp, json }
  } catch (err) {
    if (!controller.signal.aborted) {
      updateExchange(exchangeId, { error: (err as Error).message })
      throw err
    }
    const message = `MCP timeout (${MCP_TIMEOUT_MS} ms)`
    updateExchange(exchangeId, { error: message })
    throw new Error(message, { cause: err })
  } finally {
    clearTimeout(timer)
  }
}

async function mcpPost(
  conn: McpConnection,
  body: unknown,
  session?: McpSession,
): Promise<{
  status: number
  json: Record<string, unknown>
  headers: Headers
}> {
  const requestId = (body as { id?: number }).id
  const { resp, json } = await mcpFetch(conn, 'POST', session, body, async (resp) => {
    // 202/204 — notifications JSON-RPC sans corps de réponse
    if (resp.status === 202 || resp.status === 204 || resp.headers.get('content-length') === '0') {
      return null
    }
    return (resp.headers.get('content-type') ?? '').includes('text/event-stream')
      ? await readSSEResponse(resp.body!, requestId)
      : ((await resp.json()) as Record<string, unknown>)
  })
  return { status: resp.status, json: json ?? {}, headers: resp.headers }
}

/** Lit le flux SSE jusqu'à la réponse JSON-RPC dont l'id correspond à la requête. */
async function readSSEResponse(
  stream: ReadableStream<Uint8Array>,
  requestId: unknown,
): Promise<Record<string, unknown>> {
  for await (const event of parseSSEEvents(stream)) {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(event.data) as Record<string, unknown>
    } catch {
      continue
    }
    if (message.id === requestId && ('result' in message || 'error' in message)) {
      return message
    }
  }
  throw new Error(`MCP SSE: flux terminé sans réponse (id ${String(requestId)})`)
}

async function mcpJsonRpc(
  conn: McpConnection,
  method: string,
  params: unknown,
  session?: McpSession,
): Promise<unknown> {
  const { status, json } = await mcpPost(
    conn,
    { jsonrpc: '2.0', id: nextRpcId(), method, params },
    session,
  )
  if (status === 404 && session) {
    // Session expirée — forcer une ré-initialisation au prochain appel
    sessions.delete(conn.url)
    throw new Error('MCP session expired (404) — please retry')
  }
  if (status < 200 || status >= 300) throw new Error(`MCP HTTP ${status}`)
  if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`)
  return json.result
}

async function mcpInitialize(conn: McpConnection): Promise<McpSession> {
  const existing = getSession(conn.url)
  if (existing) return existing

  const { json, headers } = await mcpPost(conn, {
    jsonrpc: '2.0',
    id: nextRpcId(),
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      clientInfo: { name: 'Chat Pédagogique IA', version: '1.0.0' },
      capabilities: {},
    },
  })

  if (json.error) throw new Error(`MCP initialize error: ${JSON.stringify(json.error)}`)

  const result = json.result as Record<string, unknown> | undefined
  const negotiatedVersion = (result?.protocolVersion as string | undefined) ?? '2025-11-25'
  const sessionId = headers.get('Mcp-Session-Id') ?? headers.get('mcp-session-id') ?? null

  const session: McpSession = { sessionId, protocolVersion: negotiatedVersion }
  sessions.set(conn.url, session)

  // Notification initialized
  await mcpPost(conn, { jsonrpc: '2.0', method: 'notifications/initialized' }, session)

  return session
}

export async function connectMcp(conn: McpConnection): Promise<void> {
  await mcpInitialize(conn)
}

async function mcpDelete(conn: McpConnection, session: McpSession): Promise<void> {
  await mcpFetch(conn, 'DELETE', session, undefined, async () => null)
}

export async function disconnectMcp(conn: McpConnection): Promise<void> {
  const session = getSession(conn.url)
  try {
    if (session?.sessionId) await mcpDelete(conn, session)
  } finally {
    sessions.delete(conn.url)
  }
}

export async function fetchMcpTools(conn: McpConnection): Promise<McpTool[]> {
  const session = await mcpInitialize(conn)
  const result = (await mcpJsonRpc(conn, 'tools/list', {}, session)) as Record<string, unknown>
  const tools = (result.tools ?? []) as Array<{
    name: string
    description: string
    inputSchema?: unknown
  }>
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    enabled: true,
    inputSchema: t.inputSchema,
  }))
}

export async function callMcpTool(
  conn: McpConnection,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const session = await mcpInitialize(conn)
  const result = (await mcpJsonRpc(
    conn,
    'tools/call',
    { name: toolName, arguments: args },
    session,
  )) as Record<string, unknown>
  const content = result.content
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: string; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
  }
  return JSON.stringify(result)
}
