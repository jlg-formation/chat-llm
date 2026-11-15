export interface SvgPart {
  type: "text" | "svg";
  content: string;
}

// Un SVG brut, ou un bloc ```svg ; le reste reste du texte Markdown.
const SVG_RE = /```svg[ \t]*\n([\s\S]*?)```|(<svg\b[\s\S]*?<\/svg\s*>)/gi;

export function splitSvgSegments(content: string): SvgPart[] {
  const parts: SvgPart[] = [];
  let last = 0;
  for (const m of content.matchAll(SVG_RE)) {
    const svg = m[1] ?? m[2];
    if (!/<svg\b/i.test(svg)) continue;
    const start = m.index ?? 0;
    if (start > last)
      parts.push({ type: "text", content: content.slice(last, start) });
    parts.push({ type: "svg", content: svg.trim() });
    last = start + m[0].length;
  }
  if (last < content.length)
    parts.push({ type: "text", content: content.slice(last) });
  return parts;
}
