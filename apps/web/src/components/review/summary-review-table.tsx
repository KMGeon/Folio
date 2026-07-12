import type { Prologue } from "@folio/types";

import { ChapterCard } from "@/components/review/chapter-cards";
import type { ReviewChapter } from "@/lib/review-api";
import { cn } from "@/lib/utils";

import { resolvePlainSummary } from "./review-summary";

type SummarySectionId = "overview" | "purpose" | "changes" | "focus";

type SummarySection = {
  id: SummarySectionId;
  title: string;
  content: string | null;
  items?: { title: string; description: string }[];
};

export type SummaryReviewRow = {
  id: SummarySectionId;
  summary: SummarySection;
  chapter: ReviewChapter | null;
};

/** Pair fixed prologue sections to chapter order so each review row keeps its context. */
export function buildSummaryReviewRows(
  prologue: Prologue,
  chapters: ReviewChapter[],
): SummaryReviewRow[] {
  const summaries: SummarySection[] = [
    {
      id: "overview",
      title: "한눈에 보기",
      content:
        resolvePlainSummary(prologue) ??
        "이 PR이 무엇을 처리하는지는 아직 요약되지 않았습니다. 재분석 후 한 줄 설명이 여기에 표시됩니다.",
    },
    {
      id: "purpose",
      title: "왜 이 PR인가?",
      content: prologue.motivation ?? "변경 내용에서 명확히 확인되지 않았습니다.",
    },
    {
      id: "changes",
      title: "핵심 변경",
      content: prologue.keyChanges.length ? null : "핵심 변경이 제공되지 않았습니다.",
      items: prologue.keyChanges.map((change) => ({
        title: change.summary,
        description: change.description,
      })),
    },
    {
      id: "focus",
      title: "리뷰 포커스",
      content: prologue.focusAreas.length
        ? prologue.complexity.reasoning
        : "별도 검토 지점이 제공되지 않았습니다.",
      items: prologue.focusAreas.map((area) => ({
        title: area.title,
        description: area.description,
      })),
    },
  ];

  return summaries.map((summary, index) => ({
    id: summary.id,
    summary,
    chapter: chapters[index] ?? null,
  }));
}

export function SummaryReviewTable({
  prologue,
  chapters,
  onSelectChapter,
}: {
  prologue: Prologue;
  chapters: ReviewChapter[];
  onSelectChapter: (index: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <TableHeading>변경 요약</TableHeading>
        <TableHeading>리뷰</TableHeading>
      </div>
      {buildSummaryReviewRows(prologue, chapters).map((row) => (
        <div
          key={row.id}
          className="grid min-w-0 border-t lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
        >
          <SummaryReviewCell label="변경 요약">
            {renderSummarySection(row.summary)}
          </SummaryReviewCell>
          <SummaryReviewCell label="리뷰" className="lg:border-l">
            {row.chapter ? (
              <ChapterCard chapter={row.chapter} onSelect={onSelectChapter} />
            ) : (
              <EmptyReviewCell />
            )}
          </SummaryReviewCell>
        </div>
      ))}
    </div>
  );
}

function TableHeading({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-2 font-medium text-muted-foreground text-xs">{children}</div>;
}

function SummaryReviewCell({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 px-4 py-3.5", className)}>
      <div className="mb-2 font-medium text-muted-foreground text-xs lg:hidden">{label}</div>
      {children}
    </div>
  );
}

function renderSummarySection(summary: SummarySection) {
  return (
    <section>
      <h3 className="font-medium text-sm text-foreground">{summary.title}</h3>
      {summary.content ? (
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{summary.content}</p>
      ) : null}
      {summary.items?.length ? (
        <ul className="mt-2.5 space-y-2">
          {summary.items.map((item) => (
            <li
              key={`${item.title}-${item.description}`}
              className="border-l-2 border-primary/50 pl-3"
            >
              <p className="font-medium text-sm leading-snug">{item.title}</p>
              <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{item.description}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function EmptyReviewCell() {
  return <p className="text-sm leading-6 text-muted-foreground">연결된 리뷰 챕터가 없습니다.</p>;
}
