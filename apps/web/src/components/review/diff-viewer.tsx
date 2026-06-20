import { ChevronDown, Circle, FileText } from "lucide-react";

import { highlightMarkdownLine } from "@/lib/highlight";
import type { ReviewChapter } from "@/lib/review-api";
import { cn } from "@/lib/utils";

// overallSummary, focusAreas, risks, and REVIEW_COMMENT are not in ReviewPayload;
// those sub-sections are omitted to avoid re-introducing the sample import.

const SIGN: Record<string, string> = { add: "+", del: "-", ctx: " " };

export function DiffViewer({ chapter }: { chapter: ReviewChapter }) {
  const diffFile = chapter.files[0]?.path ?? "unknown";
  const additions = chapter.files.reduce((sum, file) => sum + file.additions, 0);

  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-4">
      <section className="mb-4 rounded-lg border bg-card p-4">
        <div className="text-xs font-medium text-muted-foreground">챕터 개요</div>
        <h2 className="mt-2 text-lg font-semibold">{chapter.title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{chapter.summary}</p>
      </section>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-3 py-2.5 text-sm">
          <ChevronDown className="size-4 text-muted-foreground" />
          <FileText className="size-4 text-primary" />
          <span className="min-w-0 truncate font-mono text-[13px]">{diffFile}</span>
          <span className="ml-2 font-mono text-xs text-primary">+{additions}</span>
          <Circle className="ml-auto size-4 text-muted-foreground" />
        </div>

        <div className="overflow-x-auto font-mono text-xs leading-4">
          <table className="w-full border-collapse">
            <tbody>
              {chapter.diffLines.map((line, i) => (
                <tr
                  key={`${line.n}-${i}`}
                  className={cn(
                    line.kind === "add" && "bg-diff-add-bg",
                    line.kind === "del" && "bg-diff-del-bg",
                  )}
                >
                  <td className="w-12 select-none border-r border-border/60 px-2 text-right align-top text-gutter tabular-nums">
                    {line.n}
                  </td>
                  <td
                    className={cn(
                      "w-5 select-none px-1 text-center align-top",
                      line.kind === "add" && "text-diff-add-fg",
                      line.kind === "del" && "text-diff-del-fg",
                      line.kind === "ctx" && "text-transparent",
                    )}
                  >
                    {SIGN[line.kind]}
                  </td>
                  <td className="whitespace-pre-wrap break-words py-px pr-4 align-top text-foreground/90">
                    {highlightMarkdownLine(line.text, `l${i}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
