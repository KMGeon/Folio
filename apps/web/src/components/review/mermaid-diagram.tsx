"use client";

import React, { useEffect, useId, useState } from "react";

const MAX_MERMAID_SOURCE_LENGTH = 20_000;

export function mermaidSourceError(source: string): "empty" | "too-large" | null {
  if (!source.trim()) {
    return "empty";
  }
  if (source.length > MAX_MERMAID_SOURCE_LENGTH) {
    return "too-large";
  }
  return null;
}

export function MermaidDiagram({ source, label }: { source: string; label: string }) {
  const renderId = useId().replace(/:/gu, "");
  const [state, setState] = useState<{ kind: "loading" | "error" | "ready"; svg?: string }>({
    kind: "loading",
  });

  useEffect(() => {
    let active = true;
    const sourceError = mermaidSourceError(source);
    if (sourceError) {
      setState({ kind: "error" });
      return () => {
        active = false;
      };
    }
    // Do not leave a prior diagram visible while this source renders asynchronously.
    setState({ kind: "loading" });

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;
        const styles = getComputedStyle(document.documentElement);
        // Generated diagrams are untrusted display data, so Mermaid remains in strict mode.
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          maxTextSize: MAX_MERMAID_SOURCE_LENGTH,
          themeVariables: {
            background: styles.getPropertyValue("--card").trim(),
            primaryColor: styles.getPropertyValue("--muted").trim(),
            primaryTextColor: styles.getPropertyValue("--foreground").trim(),
            primaryBorderColor: styles.getPropertyValue("--border").trim(),
            lineColor: styles.getPropertyValue("--muted-foreground").trim(),
          },
        });
        const { svg } = await mermaid.render(`folio-mermaid-${renderId}`, source);
        if (active) {
          setState({ kind: "ready", svg });
        }
      } catch {
        if (active) {
          setState({ kind: "error" });
        }
      }
    }

    void renderDiagram();
    return () => {
      active = false;
    };
  }, [renderId, source]);

  if (state.kind === "loading") {
    return <div aria-busy className="mt-3 h-32 animate-pulse rounded-md border bg-muted/40" />;
  }
  if (state.kind === "error") {
    return (
      <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
        흐름도를 표시할 수 없습니다.
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={label}
      className="mt-3 overflow-x-auto rounded-md border bg-card p-3"
      dangerouslySetInnerHTML={{ __html: state.svg ?? "" }}
    />
  );
}
