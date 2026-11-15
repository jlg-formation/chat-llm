// ─── Parseur de blocs XML (ex: <think>…</think>) ─────────────────────────────

interface Segment {
  type: "text" | "xml";
  content: string;
  tag?: string;
  unclosed?: boolean;
}

export function parseXmlBlocks(content: string): Segment[] {
  const segments: Segment[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    }
    segments.push({ type: "xml", tag: match[1], content: match[2] });
    lastIndex = re.lastIndex;
  }

  const remaining = content.slice(lastIndex);
  const openTag = remaining.match(/^<(\w+)>([\s\S]*)$/);
  if (openTag) {
    segments.push({
      type: "xml",
      tag: openTag[1],
      content: openTag[2],
      unclosed: true,
    });
  } else if (remaining) {
    segments.push({ type: "text", content: remaining });
  }

  return segments;
}
