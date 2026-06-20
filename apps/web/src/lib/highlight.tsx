import type { ReactNode } from "react";

/*
 * A deliberately small markdown line highlighter — just enough to match the
 * Folio code panel: ATX headings, inline `code`, [links](url), list markers,
 * and ordered-list numbers. It is line-based (the diff renders one row per
 * line) and never spans multiple lines.
 */

function highlightInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split on inline code first so URLs/links inside code are left alone.
  const parts = text.split(/(`[^`]+`)/g);
  let k = 0;
  for (const part of parts) {
    if (!part) {
      continue;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      nodes.push(
        <span key={`${keyPrefix}-c${k++}`} className="text-syntax-code">
          {part}
        </span>,
      );
      continue;
    }
    // Within a non-code part, colour [text](url) links.
    const linkRe = /\[[^\]]+\]\([^)]+\)/g;
    let last = 0;
    let m: RegExpExecArray | null = linkRe.exec(part);
    while (m !== null) {
      if (m.index > last) {
        nodes.push(<span key={`${keyPrefix}-t${k++}`}>{part.slice(last, m.index)}</span>);
      }
      nodes.push(
        <span key={`${keyPrefix}-l${k++}`} className="text-syntax-link">
          {m[0]}
        </span>,
      );
      last = m.index + m[0].length;
      m = linkRe.exec(part);
    }
    if (last < part.length) {
      nodes.push(<span key={`${keyPrefix}-t${k++}`}>{part.slice(last)}</span>);
    }
  }
  return nodes;
}

export function highlightMarkdownLine(text: string, lineKey: string): ReactNode {
  if (text === "") {
    return null;
  }

  // Headings: "# ", "## ", ...
  const heading = text.match(/^(#{1,6})\s+(.*)$/);
  if (heading) {
    return (
      <span className="text-syntax-heading">
        {heading[1]} {highlightInline(heading[2] ?? "", lineKey)}
      </span>
    );
  }

  // Ordered list: "1. ..."
  const ordered = text.match(/^(\s*)(\d+\.)\s+(.*)$/);
  if (ordered) {
    return (
      <>
        {ordered[1]}
        <span className="text-syntax-heading">{ordered[2]} </span>
        {highlightInline(ordered[3] ?? "", lineKey)}
      </>
    );
  }

  // Unordered list: "- ..." (preserve leading indent)
  const bullet = text.match(/^(\s*)([-*])\s+(.*)$/);
  if (bullet) {
    return (
      <>
        {bullet[1]}
        <span className="text-syntax-heading">{bullet[2]} </span>
        {highlightInline(bullet[3] ?? "", lineKey)}
      </>
    );
  }

  return <>{highlightInline(text, lineKey)}</>;
}
