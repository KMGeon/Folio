import type { ComplexityLevel, FocusAreaSeverity, Prologue } from "@folio/types";

import { ChapterCard } from "@/components/review/chapter-cards";
import { MermaidDiagram } from "@/components/review/mermaid-diagram";
import type { ReviewChapter } from "@/lib/review-api";
import { cn } from "@/lib/utils";

import { resolvePlainSummary } from "./review-summary";

type SummarySectionId = "overview" | "purpose" | "changes" | "focus";

type SummarySection = {
  id: SummarySectionId;
  title: string;
  content: string | null;
  items?: { title: string; description: string }[];
  outcome?: string | null;
  diagram?: string | null;
  complexity?: Prologue["complexity"];
  focusAreas?: Prologue["focusAreas"];
};

const complexityClasses: Record<ComplexityLevel, string> = {
  low: "border-primary/30 bg-primary/10 text-primary",
  medium: "border-warning/45 bg-warning/15 text-warning",
  high: "border-destructive/30 bg-destructive/10 text-destructive",
  "very-high": "border-destructive/40 bg-destructive/15 text-destructive",
};

const severityClasses: Record<FocusAreaSeverity, string> = {
  critical: "border-destructive/40 bg-destructive/15 text-destructive",
  high: "border-destructive/30 bg-destructive/10 text-destructive",
  medium: "border-warning/45 bg-warning/15 text-warning",
  info: "border-info/40 bg-info/15 text-info",
};

export type SummaryReviewRow =
  | {
      id: SummarySectionId;
      summary: SummarySection;
      chapter: ReviewChapter | null;
    }
  | {
      id: `chapter-${number}`;
      summary: null;
      chapter: ReviewChapter;
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
      outcome: prologue.outcome,
      diagram: prologue.diagram,
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
      content: null,
      complexity: prologue.complexity,
      focusAreas: prologue.focusAreas,
    },
  ];

  const rowCount = Math.max(summaries.length, chapters.length);

  return Array.from({ length: rowCount }, (_, index) => {
    const summary = summaries[index];
    const chapter = chapters[index];

    if (summary) {
      return { id: summary.id, summary, chapter: chapter ?? null };
    }

    // Extra chapters remain reachable from the shared comparison surface.
    if (!chapter) {
      throw new Error("Summary review row is missing both a summary and chapter.");
    }

    return { id: `chapter-${chapter.index}` as const, summary: null, chapter };
  });
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
            {row.summary ? (
              renderSummarySection(row.summary)
            ) : (
              <SummaryContinuationCell chapter={row.chapter} />
            )}
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
  if (summary.id === "purpose") {
    return <PurposeSummarySection summary={summary} />;
  }
  if (summary.id === "focus") {
    return <FocusSummarySection summary={summary} />;
  }

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

function PurposeSummarySection({ summary }: { summary: SummarySection }) {
  return (
    <section>
      <h3 className="font-medium text-sm text-foreground">{summary.title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{summary.content}</p>
      <div className="mt-4">
        <h4 className="font-medium text-sm text-foreground">무엇을 하는가</h4>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          {summary.outcome ?? "변경 내용에서 명확히 확인되지 않았습니다."}
        </p>
        {summary.diagram ? (
          <div className="mt-3">
            <MermaidDiagram source={summary.diagram} label="PR 변경 흐름도" />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FocusSummarySection({ summary }: { summary: SummarySection }) {
  const complexity = summary.complexity;
  const focusAreas = summary.focusAreas ?? [];

  if (!complexity) {
    return null;
  }

  return (
    <section>
      <h3 className="font-medium text-sm text-foreground">{summary.title}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 font-medium text-xs",
            complexityClasses[complexity.level],
          )}
        >
          {complexity.level}
        </span>
        <p className="text-muted-foreground text-sm leading-6">{complexity.reasoning}</p>
      </div>
      {focusAreas.length ? (
        <div className="mt-3 space-y-2.5">
          {focusAreas.map((area) => (
            <div
              key={`${area.type}-${area.title}`}
              className="rounded-md border bg-muted/20 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-medium text-xs",
                    severityClasses[area.severity],
                  )}
                >
                  {area.severity}
                </span>
                <span className="font-medium text-sm leading-snug">{area.title}</span>
              </div>
              <p className="mt-1.5 text-muted-foreground text-sm leading-6">{area.description}</p>
              {area.locations.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {area.locations.map((location) => (
                    <span
                      key={location}
                      className="rounded-md bg-muted px-2 py-0.5 font-mono text-muted-foreground text-xs"
                    >
                      {location}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-muted-foreground text-sm leading-6">
          별도 검토 지점이 제공되지 않았습니다.
        </p>
      )}
    </section>
  );
}

function EmptyReviewCell() {
  return <p className="text-sm leading-6 text-muted-foreground">연결된 리뷰 챕터가 없습니다.</p>;
}

function SummaryContinuationCell({ chapter }: { chapter: ReviewChapter }) {
  return (
    <section>
      <p className="font-medium text-muted-foreground text-xs">추가 챕터</p>
      <p className="mt-1 text-sm text-muted-foreground">제{chapter.index}장 리뷰가 이어집니다.</p>
    </section>
  );
}
