import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { connectMcp, disconnectMcp } from '@/services/mcp'
import { fetchMock, freshServer, initResponse, acceptedResponse, methodsSent } from './mcpFixtures'

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
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
    expect(methodsSent().filter((m) => m === 'initialize')).toHaveLength(2)
  })

  it('is a no-op for an unknown connection', async () => {
    await expect(disconnectMcp(freshServer())).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
