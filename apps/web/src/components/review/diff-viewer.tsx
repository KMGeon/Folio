import { AlertTriangle, ChevronDown, Circle, FileText } from "lucide-react";

import { highlightMarkdownLine } from "@/lib/highlight";
import { DIFF_LINES, PR, REVIEW_COMMENT, getActiveChapter } from "@/lib/sample-review";
import { cn } from "@/lib/utils";

const SIGN: Record<string, string> = { add: "+", del: "-", ctx: " " };

export function DiffViewer() {
  const chapter = getActiveChapter();
  const diffFile = chapter.files[0]?.path ?? "unknown";
  const additions = chapter.files.reduce((sum, file) => sum + file.additions, 0);

  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-4">
      <section className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">PR Overview</div>
          <h2 className="mt-2 text-lg font-semibold">{PR.title}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{PR.overallSummary}</p>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {PR.focusAreas.map((focus) => (
              <div
                key={focus}
                className="rounded-md border bg-background/35 p-3 text-sm leading-5 text-muted-foreground"
              >
                {focus}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">Folio bot comment</div>
          <div className="mt-3 text-sm font-semibold">Ready to review this PR?</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Folio has broken it down into {PR.chapters.length} chapters.
          </p>
          <div className="mt-3 overflow-hidden rounded-md border">
            {PR.chapters.map((item) => (
              <div
                key={item.index}
                className="grid grid-cols-[36px_minmax(0,1fr)] border-b last:border-b-0"
              >
                <div className="border-r px-2 py-2 text-center text-xs text-muted-foreground">
                  {item.index}
                </div>
                <div className="truncate px-3 py-2 text-sm text-syntax-link">{item.title}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {chapter.risks.length > 0 && (
        <section className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" />
            위험 요소
          </div>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {chapter.risks.map((risk) => (
              <li key={`${risk.file}-${risk.why}`}>
                <span className="font-mono text-foreground">{risk.file}</span> — {risk.why}
              </li>
            ))}
          </ul>
        </section>
      )}

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
              {DIFF_LINES.map((line, i) => (
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

      <section className="mt-4 rounded-lg border bg-card p-4">
        <div className="text-xs font-medium text-muted-foreground">
          기존 PR summary comment mock
        </div>
        <h3 className="mt-3 text-lg font-semibold">Summary</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {REVIEW_COMMENT.summary.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h3 className="mt-5 text-lg font-semibold">Verification</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {REVIEW_COMMENT.verification.map((item) => (
            <li key={item}>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {item}
              </code>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
