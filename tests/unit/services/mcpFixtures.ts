import { vi } from "vitest";
import { jsonResponse } from "../fixtures";

export const fetchMock = vi.fn();
let counter = 0;

// Chaque test utilise une URL distincte : les sessions MCP sont en mémoire au niveau module.
export function freshServer() {
  counter += 1;
  return {
    url: `http://mcp-${counter}.test/mcp/`,
    token: undefined as string | undefined,
  };
}

export function initResponse(sessionId: string | null = "sess-1") {
  const headers: Record<string, string> = sessionId
    ? { "Mcp-Session-Id": sessionId }
    : {};
  return jsonResponse(
    { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-11-25" } },
    200,
    headers,
  );
}

export const acceptedResponse = () => new Response(null, { status: 202 });

export function methodsSent(): string[] {
  return fetchMock.mock.calls
    .map(([, init]) => (init as RequestInit).body)
    .filter((body): body is string => typeof body === "string")
    .map((body) => JSON.parse(body).method);
}
