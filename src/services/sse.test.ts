import { describe, it, expect } from 'vitest'
import { parseSSEEvents } from './sse'
import type { SSEEvent } from './sse'

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<SSEEvent[]> {
  const out: SSEEvent[] = []
  for await (const e of parseSSEEvents(stream)) out.push(e)
  return out
}

describe('parseSSEEvents', () => {
  it('parses event, data, id and joins multi-line data', async () => {
    const events = await collect(streamOf('event: update\nid: 7\ndata: line1\ndata: line2\n\n'))
    expect(events).toEqual([{ event: 'update', data: 'line1\nline2', id: '7' }])
  })

  it('defaults the event name to message and tolerates CRLF, comments and fields without colon', async () => {
    const events = await collect(streamOf(': comment\r\ndata:abc\r\nunknown\r\n\r\n'))
    expect(events).toEqual([{ event: 'message', data: 'abc', id: undefined }])
  })

  it('joins chunks split in the middle of a line', async () => {
    const events = await collect(streamOf('da', 'ta: hi\n', '\n'))
    expect(events).toEqual([{ event: 'message', data: 'hi', id: undefined }])
  })

  it('does not emit blocks without data', async () => {
    const events = await collect(streamOf('event: ping\n\n\n'))
    expect(events).toEqual([])
  })

  it('resets event and id between blocks', async () => {
    const events = await collect(streamOf('event: a\nid: 1\ndata: x\n\ndata: y\n\n'))
    expect(events).toEqual([
      { event: 'a', data: 'x', id: '1' },
      { event: 'message', data: 'y', id: undefined },
    ])
  })
})
