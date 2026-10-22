export interface SSEEvent {
  event: string;
  data: string;
  id?: string;
}

/** Parseur SSE générique (event / data / id), indépendant des formats LLM. */
export async function* parseSSEEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data: string[] = [];
  let id: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r\n|\n|\r/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
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
  } finally {
    reader.cancel().catch(() => {
      /* flux déjà fermé */
    });
  }
}
