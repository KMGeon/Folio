import { ArrowRight, CheckCircle2, ListChecks } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { RiskPill, type RiskLevel } from "@/components/status-pill";
import type { ReviewChapter } from "@/lib/review-api";
import { cn } from "@/lib/utils";

/** Max focus questions shown as read-only preview on overview cards. */
const FOCUS_PREVIEW_LIMIT = 3;

/**
 * Overview chapter list. With `onSelect` the card is a button (in-place
 * drill-in); otherwise it links to `{prPath}/chapters/{index}`.
 *
 * Cards surface progress chips, a short summary, and a read-only preview of
 * review-focus questions so reviewers know what to inspect before opening.
 */
export function ChapterCards({
  chapters,
  prPath,
  onSelect,
}: {
  chapters: ReviewChapter[];
  prPath?: string;
  onSelect?: (index: number) => void;
}) {
  // Highlight the next chapter to open — first unviewed, else none once complete.
  const continueIndex = chapters.find((chapter) => !chapter.viewed)?.index;
  const hasStarted = chapters.some((chapter) => chapter.viewed);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {chapters.map((chapter) => (
        <ChapterCard
          key={chapter.index}
          chapter={chapter}
          prPath={prPath}
          onSelect={onSelect}
          isContinueTarget={chapter.index === continueIndex}
          hasStarted={hasStarted}
        />
      ))}
    </div>
  );
}

/** Reusable chapter metadata card for overview lists and paired summary rows. */
export function ChapterCard({
  chapter,
  prPath,
  onSelect,
  isContinueTarget = false,
  hasStarted = false,
}: {
  chapter: ReviewChapter;
  prPath?: string;
  onSelect?: (index: number) => void;
  isContinueTarget?: boolean;
  hasStarted?: boolean;
}) {
  const additions = chapter.files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = chapter.files.reduce((sum, file) => sum + file.deletions, 0);
  const risk = chapterRisk(chapter);
  const focusDone = chapter.keyChanges.filter((item) => item.viewed).length;
  const focusTotal = chapter.keyChanges.length;
  const filesDone = chapter.files.filter((file) => file.viewed).length;
  const filesTotal = chapter.files.length;
  const focusPreview = chapter.keyChanges.slice(0, FOCUS_PREVIEW_LIMIT);
  const focusRemaining = Math.max(0, focusTotal - FOCUS_PREVIEW_LIMIT);
  const body = (
    <>
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-muted-foreground text-xs">
        {chapter.viewed ? <CheckCircle2 className="size-3.5 text-primary" /> : chapter.index}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-sans text-sm font-medium leading-snug text-foreground/95 transition-colors group-hover:text-primary">
              {chapter.title}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <RiskPill risk={risk} />
              {focusTotal > 0 ? (
                <MetaChip
                  complete={focusDone === focusTotal}
                  label={`검토 ${focusDone}/${focusTotal}`}
                />
              ) : null}
              <MetaChip label={`파일 ${filesDone}/${filesTotal}`} />
              <MetaChip
                label={
                  <>
                    <span className="text-diff-add-fg">+{additions}</span>
                    {deletions > 0 ? (
                      <span className="ml-1.5 text-diff-del-fg">-{deletions}</span>
                    ) : null}
                  </>
                }
              />
            </div>

            {chapter.summary ? (
              <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-5 text-muted-foreground">
                {chapter.summary}
              </p>
            ) : null}

            {focusPreview.length > 0 ? (
              <div className="mt-3 rounded-md border border-border bg-background/40 px-3 py-2.5 text-left">
                <div className="mb-2 flex items-center gap-2 font-semibold text-primary text-xs">
                  <ListChecks className="size-3.5 shrink-0" aria-hidden />
                  검토할 사항
                  <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono font-normal text-[11px] text-muted-foreground tabular-nums">
                    {focusDone}/{focusTotal}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {focusPreview.map((item) => (
                    <li
                      key={item.id}
                      className={cn(
                        "flex items-start gap-2 text-[12.5px] leading-5",
                        item.viewed ? "text-muted-foreground line-through" : "text-foreground/90",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded border",
                          item.viewed ? "border-primary/40 bg-primary/15" : "border-foreground/25",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">{item.content}</span>
                    </li>
                  ))}
                </ul>
                {focusRemaining > 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    + 검토 사항 {focusRemaining}개 더 · 챕터에서 전부 보기
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col items-end pt-0.5">
            {isContinueTarget ? (
              <span className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-foreground text-xs">
                {hasStarted ? "이어서 리뷰" : "리뷰 시작"}
                <ArrowRight className="size-3.5" />
              </span>
            ) : (
              <ArrowRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
            )}
          </div>
        </div>
      </div>
    </>
  );
  const className = cn(
    "group flex w-full items-start gap-3 border-b px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-accent/55",
  );

  return onSelect ? (
    <button type="button" onClick={() => onSelect(chapter.index)} className={className}>
      {body}
    </button>
  ) : (
    <Link href={`${prPath}/chapters/${chapter.index}`} className={className}>
      {body}
    </Link>
  );
}

function MetaChip({ label, complete = false }: { label: ReactNode; complete?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-1 font-mono text-[11px] tabular-nums",
        complete
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function chapterRisk(chapter: ReviewChapter): RiskLevel {
  const additions = chapter.files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = chapter.files.reduce((sum, file) => sum + file.deletions, 0);
  const changed = additions + deletions;
  if (deletions > 25 || changed > 350 || chapter.files.length > 8) {
    return "high";
  }
  if (deletions > 0 || changed > 80 || chapter.files.length > 2) {
    return "medium";
  }
  return "low";
}
