import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connectMcp } from "@/services/mcp";
import { jsonResponse } from "../fixtures";
import {
  fetchMock,
  freshServer,
  initResponse,
  acceptedResponse,
  methodsSent,
} from "./mcpFixtures";

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("connectMcp", () => {
  it("initializes a session and sends the initialized notification", async () => {
    const conn = freshServer();
    fetchMock
      .mockResolvedValueOnce(initResponse("abc"))
      .mockResolvedValueOnce(acceptedResponse());
    await connectMcp(conn);
    expect(methodsSent()).toEqual(["initialize", "notifications/initialized"]);
    const notifHeaders = (fetchMock.mock.calls[1][1] as RequestInit)
      .headers as Record<string, string>;
    expect(notifHeaders["Mcp-Session-Id"]).toBe("abc");
    expect(notifHeaders["MCP-Protocol-Version"]).toBe("2025-11-25");
  });

  it("reuses the existing session on subsequent calls", async () => {
    const conn = freshServer();
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse());
    await connectMcp(conn);
    await connectMcp(conn);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the default protocol version and no session id", async () => {
    const conn = freshServer();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ jsonrpc: "2.0", id: 1, result: {} }),
      )
      .mockResolvedValueOnce(acceptedResponse());
    await connectMcp(conn);
    const notifHeaders = (fetchMock.mock.calls[1][1] as RequestInit)
      .headers as Record<string, string>;
    expect(notifHeaders["Mcp-Session-Id"]).toBeUndefined();
    expect(notifHeaders["MCP-Protocol-Version"]).toBe("2025-11-25");
  });

  it("reads the session id from a lowercase header and a missing result", async () => {
    const conn = freshServer();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1 }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "mcp-session-id": "low",
          },
        }),
      )
      .mockResolvedValueOnce(acceptedResponse());
    await connectMcp(conn);
    const notifHeaders = (fetchMock.mock.calls[1][1] as RequestInit)
      .headers as Record<string, string>;
    expect(notifHeaders["Mcp-Session-Id"]).toBe("low");
  });

  it("sends the bearer token and masks it in the HTTP log", async () => {
    const conn = { url: freshServer().url, token: "secret" };
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse());
    await connectMcp(conn);
    const sent = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(sent.Authorization).toBe("Bearer secret");
  });

  it("throws when initialize returns a JSON-RPC error", async () => {
    const conn = freshServer();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -1, message: "nope" },
      }),
    );
    await expect(connectMcp(conn)).rejects.toThrow("MCP initialize error");
  });

  it("propagates network failures", async () => {
    const conn = freshServer();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(connectMcp(conn)).rejects.toThrow("Failed to fetch");
  });

  it("reads a server-sent event response matching the request id", async () => {
    const conn = freshServer();
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      const id = JSON.parse(init.body as string).id;
      const sse = `event: message\ndata: {"jsonrpc":"2.0","id":${id},"result":{"protocolVersion":"2025-11-25"}}\n\n`;
      return Promise.resolve(
        new Response(sse, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      );
    });
    fetchMock.mockResolvedValueOnce(acceptedResponse());
    await expect(connectMcp(conn)).resolves.toBeUndefined();
  });

  it("throws when an SSE stream ends without the matching response", async () => {
    const conn = freshServer();
    fetchMock.mockResolvedValueOnce(
      new Response('event: message\ndata: {"id":0,"result":{}}\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    await expect(connectMcp(conn)).rejects.toThrow("flux terminé sans réponse");
  });

  it("ignores SSE data that is not valid JSON", async () => {
    const conn = freshServer();
    fetchMock.mockResolvedValueOnce(
      new Response("data: {broken\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    await expect(connectMcp(conn)).rejects.toThrow("flux terminé sans réponse");
  });

  it("times out after 15 seconds", async () => {
    vi.useFakeTimers();
    const conn = freshServer();
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const assertion = expect(connectMcp(conn)).rejects.toThrow(
      "MCP timeout (15000 ms)",
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });
});
