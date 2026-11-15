import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchMcpTools, callMcpTool } from "@/services/mcp";
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

describe("fetchMcpTools", () => {
  it("lists enabled tools with their input schema", async () => {
    const conn = freshServer();
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            tools: [
              {
                name: "search",
                description: "Cherche",
                inputSchema: { type: "object" },
              },
              { name: "bare", description: "Sans schéma" },
            ],
          },
        }),
      );
    expect(await fetchMcpTools(conn)).toEqual([
      {
        name: "search",
        description: "Cherche",
        enabled: true,
        inputSchema: { type: "object" },
      },
      {
        name: "bare",
        description: "Sans schéma",
        enabled: true,
        inputSchema: undefined,
      },
    ]);
  });

  it("returns no tools when the result has none", async () => {
    const conn = freshServer();
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(
        jsonResponse({ jsonrpc: "2.0", id: 2, result: {} }),
      );
    expect(await fetchMcpTools(conn)).toEqual([]);
  });

  it("throws on a non-2xx status", async () => {
    const conn = freshServer();
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));
    await expect(fetchMcpTools(conn)).rejects.toThrow("MCP HTTP 500");
  });

  it("throws on a JSON-RPC error", async () => {
    const conn = freshServer();
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(
        jsonResponse({ jsonrpc: "2.0", id: 2, error: { code: -32601 } }),
      );
    await expect(fetchMcpTools(conn)).rejects.toThrow("MCP error");
  });

  it("drops the session on 404 and re-initializes on the next call", async () => {
    const conn = freshServer();
    fetchMock
      .mockResolvedValueOnce(initResponse("s1"))
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(jsonResponse({ error: "gone" }, 404));
    await expect(fetchMcpTools(conn)).rejects.toThrow("session expired");

    fetchMock
      .mockResolvedValueOnce(initResponse("s2"))
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(
        jsonResponse({ jsonrpc: "2.0", id: 4, result: { tools: [] } }),
      );
    expect(await fetchMcpTools(conn)).toEqual([]);
    expect(methodsSent().filter((m) => m === "initialize")).toHaveLength(2);
  });

  it("reports a 404 even without a session id as an expired session", async () => {
    const conn = freshServer();
    fetchMock
      .mockResolvedValueOnce(initResponse(null))
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(jsonResponse({}, 404));
    await expect(fetchMcpTools(conn)).rejects.toThrow("session expired");
  });

  it("logs and rethrows a transport error", async () => {
    const conn = freshServer();
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockRejectedValueOnce(new TypeError("offline"));
    await expect(fetchMcpTools(conn)).rejects.toThrow("offline");
  });
});

describe("callMcpTool", () => {
  it("joins text content blocks and ignores other types", async () => {
    const conn = freshServer();
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            content: [
              { type: "text", text: "un" },
              { type: "image", data: "x" },
              { type: "text", text: "deux" },
            ],
          },
        }),
      );
    expect(await callMcpTool(conn, "search", { q: "x" })).toBe("un\ndeux");
  });

  it("returns the raw result as JSON when content is not an array", async () => {
    const conn = freshServer();
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(
        jsonResponse({ jsonrpc: "2.0", id: 2, result: { value: 42 } }),
      );
    expect(await callMcpTool(conn, "calc", {})).toBe('{"value":42}');
  });
});
