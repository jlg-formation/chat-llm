import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { connectMcp, disconnectMcp, fetchMcpTools, callMcpTool } from './mcp'
import { jsonResponse } from '../test/fixtures'

const fetchMock = vi.fn()
let counter = 0

// Chaque test utilise une URL distincte : les sessions MCP sont en mémoire au niveau module.
function freshServer() {
  counter += 1
  return { url: `http://mcp-${counter}.test/mcp/`, token: undefined as string | undefined }
}

function initResponse(sessionId: string | null = 'sess-1') {
  const headers: Record<string, string> = sessionId ? { 'Mcp-Session-Id': sessionId } : {}
  return jsonResponse({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25' } }, 200, headers)
}

const acceptedResponse = () => new Response(null, { status: 202 })

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function methodsSent(): string[] {
  return fetchMock.mock.calls
    .map(([, init]) => (init as RequestInit).body)
    .filter((body): body is string => typeof body === 'string')
    .map(body => JSON.parse(body).method)
}

describe('connectMcp', () => {
  it('initializes a session and sends the initialized notification', async () => {
    const conn = freshServer()
    fetchMock.mockResolvedValueOnce(initResponse('abc')).mockResolvedValueOnce(acceptedResponse())
    await connectMcp(conn)
    expect(methodsSent()).toEqual(['initialize', 'notifications/initialized'])
    const notifHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>
    expect(notifHeaders['Mcp-Session-Id']).toBe('abc')
    expect(notifHeaders['MCP-Protocol-Version']).toBe('2025-11-25')
  })

  it('reuses the existing session on subsequent calls', async () => {
    const conn = freshServer()
    fetchMock.mockResolvedValueOnce(initResponse()).mockResolvedValueOnce(acceptedResponse())
    await connectMcp(conn)
    await connectMcp(conn)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to the default protocol version and no session id', async () => {
    const conn = freshServer()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }))
      .mockResolvedValueOnce(acceptedResponse())
    await connectMcp(conn)
    const notifHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>
    expect(notifHeaders['Mcp-Session-Id']).toBeUndefined()
    expect(notifHeaders['MCP-Protocol-Version']).toBe('2025-11-25')
  })

  it('reads the session id from a lowercase header and a missing result', async () => {
    const conn = freshServer()
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: '2.0', id: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'mcp-session-id': 'low' },
      }))
      .mockResolvedValueOnce(acceptedResponse())
    await connectMcp(conn)
    const notifHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>
    expect(notifHeaders['Mcp-Session-Id']).toBe('low')
  })

  it('sends the bearer token and masks it in the HTTP log', async () => {
    const conn = { url: freshServer().url, token: 'secret' }
    fetchMock.mockResolvedValueOnce(initResponse()).mockResolvedValueOnce(acceptedResponse())
    await connectMcp(conn)
    const sent = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(sent.Authorization).toBe('Bearer secret')
  })

  it('throws when initialize returns a JSON-RPC error', async () => {
    const conn = freshServer()
    fetchMock.mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -1, message: 'nope' } }))
    await expect(connectMcp(conn)).rejects.toThrow('MCP initialize error')
  })

  it('propagates network failures', async () => {
    const conn = freshServer()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(connectMcp(conn)).rejects.toThrow('Failed to fetch')
  })

  it('reads a server-sent event response matching the request id', async () => {
    const conn = freshServer()
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      const id = JSON.parse(init.body as string).id
      const sse = `event: message\ndata: {"jsonrpc":"2.0","id":${id},"result":{"protocolVersion":"2025-11-25"}}\n\n`
      return Promise.resolve(new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
    })
    fetchMock.mockResolvedValueOnce(acceptedResponse())
    await expect(connectMcp(conn)).resolves.toBeUndefined()
  })

  it('throws when an SSE stream ends without the matching response', async () => {
    const conn = freshServer()
    fetchMock.mockResolvedValueOnce(new Response('event: message\ndata: {"id":0,"result":{}}\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }))
    await expect(connectMcp(conn)).rejects.toThrow('flux terminé sans réponse')
  })

  it('ignores SSE data that is not valid JSON', async () => {
    const conn = freshServer()
    fetchMock.mockResolvedValueOnce(new Response('data: {broken\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }))
    await expect(connectMcp(conn)).rejects.toThrow('flux terminé sans réponse')
  })

  it('times out after 15 seconds', async () => {
    vi.useFakeTimers()
    const conn = freshServer()
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const assertion = expect(connectMcp(conn)).rejects.toThrow('MCP timeout (15000 ms)')
    await vi.advanceTimersByTimeAsync(15_000)
    await assertion
  })
})

describe('fetchMcpTools', () => {
  it('lists enabled tools with their input schema', async () => {
    const conn = freshServer()
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools: [
        { name: 'search', description: 'Cherche', inputSchema: { type: 'object' } },
        { name: 'bare', description: 'Sans schéma' },
      ] } }))
    expect(await fetchMcpTools(conn)).toEqual([
      { name: 'search', description: 'Cherche', enabled: true, inputSchema: { type: 'object' } },
      { name: 'bare', description: 'Sans schéma', enabled: true, inputSchema: undefined },
    ])
  })

  it('returns no tools when the result has none', async () => {
    const conn = freshServer()
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: {} }))
    expect(await fetchMcpTools(conn)).toEqual([])
  })

  it('throws on a non-2xx status', async () => {
    const conn = freshServer()
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
    await expect(fetchMcpTools(conn)).rejects.toThrow('MCP HTTP 500')
  })

  it('throws on a JSON-RPC error', async () => {
    const conn = freshServer()
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, error: { code: -32601 } }))
    await expect(fetchMcpTools(conn)).rejects.toThrow('MCP error')
  })

  it('drops the session on 404 and re-initializes on the next call', async () => {
    const conn = freshServer()
    fetchMock
      .mockResolvedValueOnce(initResponse('s1'))
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(jsonResponse({ error: 'gone' }, 404))
    await expect(fetchMcpTools(conn)).rejects.toThrow('session expired')

    fetchMock
      .mockResolvedValueOnce(initResponse('s2'))
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 4, result: { tools: [] } }))
    expect(await fetchMcpTools(conn)).toEqual([])
    expect(methodsSent().filter(m => m === 'initialize')).toHaveLength(2)
  })

  it('reports a 404 even without a session id as an expired session', async () => {
    const conn = freshServer()
    fetchMock
      .mockResolvedValueOnce(initResponse(null))
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(jsonResponse({}, 404))
    await expect(fetchMcpTools(conn)).rejects.toThrow('session expired')
  })

  it('logs and rethrows a transport error', async () => {
    const conn = freshServer()
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockRejectedValueOnce(new TypeError('offline'))
    await expect(fetchMcpTools(conn)).rejects.toThrow('offline')
  })
})

describe('callMcpTool', () => {
  it('joins text content blocks and ignores other types', async () => {
    const conn = freshServer()
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: {
        content: [{ type: 'text', text: 'un' }, { type: 'image', data: 'x' }, { type: 'text', text: 'deux' }],
      } }))
    expect(await callMcpTool(conn, 'search', { q: 'x' })).toBe('un\ndeux')
  })

  it('returns the raw result as JSON when content is not an array', async () => {
    const conn = freshServer()
    fetchMock
      .mockResolvedValueOnce(initResponse())
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: { value: 42 } }))
    expect(await callMcpTool(conn, 'calc', {})).toBe('{"value":42}')
  })
})

describe('disconnectMcp', () => {
  it('sends DELETE when a session id exists', async () => {
    const conn = freshServer()
    fetchMock
      .mockResolvedValueOnce(initResponse('del'))
      .mockResolvedValueOnce(acceptedResponse())
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    await connectMcp(conn)
    await disconnectMcp(conn)
    expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe('DELETE')
  })

  it('does not send DELETE without a session id', async () => {
    const conn = freshServer()
    fetchMock.mockResolvedValueOnce(initResponse(null)).mockResolvedValueOnce(acceptedResponse())
    await connectMcp(conn)
    await disconnectMcp(conn)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('forgets the session even when DELETE fails', async () => {
    const conn = freshServer()
    fetchMock
      .mockResolvedValueOnce(initResponse('x'))
      .mockResolvedValueOnce(acceptedResponse())
      .mockRejectedValueOnce(new TypeError('down'))
    await connectMcp(conn)
    await expect(disconnectMcp(conn)).rejects.toThrow('down')

    fetchMock.mockResolvedValueOnce(initResponse('y')).mockResolvedValueOnce(acceptedResponse())
    await connectMcp(conn)
    expect(methodsSent().filter(m => m === 'initialize')).toHaveLength(2)
  })

  it('is a no-op for an unknown connection', async () => {
    await expect(disconnectMcp(freshServer())).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
