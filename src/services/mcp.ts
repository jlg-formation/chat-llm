import type { McpServer, McpTool } from "../types";
import { addExchange, updateExchange } from "../store/httpStore";

export type McpConnection = Pick<McpServer, "url" | "token">;

function genId() {
  return Math.random().toString(36).slice(2);
}

interface McpSession {
  sessionId: string | null;
  protocolVersion: string;
}

const sessions = new Map<string, McpSession>();

function getSession(mcpUrl: string): McpSession | undefined {
  return sessions.get(mcpUrl);
}

function buildHeaders(
  session: McpSession | undefined,
  token?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (session) {
    headers["MCP-Protocol-Version"] = session.protocolVersion;
    if (session.sessionId) {
      headers["Mcp-Session-Id"] = session.sessionId;
    }
  }
  return headers;
}

function maskAuthorization(
  headers: Record<string, string>,
): Record<string, string> {
  return headers.Authorization
    ? { ...headers, Authorization: "Bearer ***" }
    : headers;
}

async function mcpPost(
  conn: McpConnection,
  body: unknown,
  session?: McpSession,
): Promise<{
  status: number;
  json: Record<string, unknown>;
  headers: Headers;
}> {
  const url = conn.url.replace(/\/$/, "");
  const exchangeId = genId();
  const reqHeaders = buildHeaders(session, conn.token);
  addExchange({
    id: exchangeId,
    timestamp: Date.now(),
    type: "mcp",
    method: "POST",
    url,
    requestHeaders: maskAuthorization(reqHeaders),
    requestBody: body,
  });
  const resp = await fetch(url, {
    method: "POST",
    headers: reqHeaders,
    body: JSON.stringify(body),
  });
  // 202/204 — notifications JSON-RPC sans corps de réponse
  if (
    resp.status === 202 ||
    resp.status === 204 ||
    resp.headers.get("content-length") === "0"
  ) {
    updateExchange(exchangeId, {
      responseStatus: resp.status,
      responseBody: null,
    });
    return { status: resp.status, json: {}, headers: resp.headers };
  }
  const json = (await resp.json()) as Record<string, unknown>;
  updateExchange(exchangeId, {
    responseStatus: resp.status,
    responseBody: json,
  });
  return { status: resp.status, json, headers: resp.headers };
}

async function mcpJsonRpc(
  conn: McpConnection,
  method: string,
  params: unknown,
  session?: McpSession,
): Promise<unknown> {
  const { status, json } = await mcpPost(
    conn,
    { jsonrpc: "2.0", id: 1, method, params },
    session,
  );
  if (status === 404 && session) {
    // Session expirée — forcer une ré-initialisation au prochain appel
    sessions.delete(conn.url);
    throw new Error("MCP session expired (404) — please retry");
  }
  if (status < 200 || status >= 300) throw new Error(`MCP HTTP ${status}`);
  if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function mcpInitialize(conn: McpConnection): Promise<McpSession> {
  const existing = getSession(conn.url);
  if (existing) return existing;

  const { json, headers } = await mcpPost(conn, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      clientInfo: { name: "Chat Pédagogique IA", version: "1.0.0" },
      capabilities: {},
    },
  });

  if (json.error)
    throw new Error(`MCP initialize error: ${JSON.stringify(json.error)}`);

  const result = json.result as Record<string, unknown> | undefined;
  const negotiatedVersion =
    (result?.protocolVersion as string | undefined) ?? "2025-11-25";
  const sessionId =
    headers.get("Mcp-Session-Id") ?? headers.get("mcp-session-id") ?? null;

  const session: McpSession = { sessionId, protocolVersion: negotiatedVersion };
  sessions.set(conn.url, session);

  // Notification initialized
  await mcpPost(
    conn,
    { jsonrpc: "2.0", method: "notifications/initialized" },
    session,
  );

  return session;
}

export async function connectMcp(conn: McpConnection): Promise<void> {
  await mcpInitialize(conn);
}

export async function disconnectMcp(conn: McpConnection): Promise<void> {
  const session = getSession(conn.url);
  try {
    await mcpJsonRpc(conn, "shutdown", {}, session).catch(() => {
      /* shutdown errors are non-fatal */
    });
    await mcpPost(conn, { jsonrpc: "2.0", method: "exit" }, session);
  } finally {
    sessions.delete(conn.url);
  }
}

export async function fetchMcpTools(conn: McpConnection): Promise<McpTool[]> {
  const session = await mcpInitialize(conn);
  const result = (await mcpJsonRpc(conn, "tools/list", {}, session)) as Record<
    string,
    unknown
  >;
  const tools = (result.tools ?? []) as Array<{
    name: string;
    description: string;
    inputSchema?: unknown;
  }>;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    enabled: true,
    inputSchema: t.inputSchema,
  }));
}

export async function callMcpTool(
  conn: McpConnection,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const session = await mcpInitialize(conn);
  const result = (await mcpJsonRpc(
    conn,
    "tools/call",
    { name: toolName, arguments: args },
    session,
  )) as Record<string, unknown>;
  const content = result.content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: string; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  }
  return JSON.stringify(result);
}
