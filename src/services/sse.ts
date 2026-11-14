export interface SSEEvent {
  event: string;
  data: string;
  id?: string;
}

/** Lit un flux d'octets ligne par ligne (séparateurs \r\n, \n ou \r). */
export async function* readLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r\n|\n|\r/);
      buffer = lines.pop() ?? "";
      yield* lines;
    }
    if (buffer) yield buffer;
  } finally {
    reader.cancel().catch(() => {
      /* flux déjà fermé */
    });
  }
}

/** Parseur SSE générique (event / data / id), indépendant des formats LLM. */
export async function* parseSSEEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEvent> {
  let event = "message";
  let data: string[] = [];
  let id: string | undefined;

  for await (const line of readLines(stream)) {
    if (line === "") {
      if (data.length > 0) yield { event, data: data.join("\n"), id };
      event = "message";
      data = [];
      id = undefined;
      continue;
    }
    if (line.startsWith(":")) continue;

    const sep = line.indexOf(":");
    const field = sep === -1 ? line : line.slice(0, sep);
    let value = sep === -1 ? "" : line.slice(sep + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "data") data.push(value);
    else if (field === "event") event = value;
    else if (field === "id") id = value;
  }
}
