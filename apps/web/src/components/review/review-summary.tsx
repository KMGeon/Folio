import {
  Braces,
  GitPullRequestArrow,
  ListChecks,
  ScanSearch,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import React from "react";

import type { ComplexityLevel, FocusAreaSeverity, Prologue } from "@folio/types";

import { MermaidDiagram } from "@/components/review/mermaid-diagram";
import { cn } from "@/lib/utils";

const complexityClasses: Record<ComplexityLevel, string> = {
  low: "border-primary/30 bg-primary/10 text-primary",
  // Amber for mid-tier — grey medium chips read as “no signal” on dark cards.
  medium: "border-warning/45 bg-warning/15 text-warning",
  high: "border-destructive/35 bg-destructive/12 text-destructive",
  "very-high": "border-destructive/45 bg-destructive/18 text-destructive",
};

const severityClasses: Record<FocusAreaSeverity, string> = {
  critical: "border-destructive/45 bg-destructive/18 text-destructive",
  high: "border-destructive/35 bg-destructive/12 text-destructive",
  medium: "border-warning/45 bg-warning/15 text-warning",
  info: "border-info/40 bg-info/15 text-info",
};

/** Prefer AI plainSummary; fall back to motivation/outcome for older prologues. */
export function resolvePlainSummary(prologue: Prologue): string | null {
  const dedicated = prologue.plainSummary?.trim();
  if (dedicated) {
    return dedicated;
  }
  const parts = [prologue.motivation?.trim(), prologue.outcome?.trim()].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : null;
}

export function ReviewSummary({ prologue }: { prologue: Prologue }) {
  const plainSummary = resolvePlainSummary(prologue);

  return (
    <article className="space-y-7 rounded-lg border bg-card p-6 md:p-8">
      {/* Fluorescent callout — non-engineer TL;DR sits above code-level detail. */}
      <PlainSummaryBanner text={plainSummary} />

      <SummarySection icon={GitPullRequestArrow} title="왜 이 PR인가?" tone="info">
        <p className={cn("text-sm leading-7", !prologue.motivation && "text-muted-foreground")}>
          {prologue.motivation ?? "변경 내용에서 명확히 확인되지 않았습니다."}
        </p>
      </SummarySection>
      <SummarySection icon={Braces} title="무엇을 하는가" tone="primary">
        <p className={cn("text-sm leading-7", !prologue.outcome && "text-muted-foreground")}>
          {prologue.outcome ?? "변경 내용에서 명확히 확인되지 않았습니다."}
        </p>
        {prologue.diagram ? (
          <div className="mt-4">
            <MermaidDiagram source={prologue.diagram} label="PR 변경 흐름도" />
          </div>
        ) : null}
      </SummarySection>
      <SummarySection icon={ListChecks} title="핵심 변경" tone="emphasis">
        {prologue.keyChanges.length ? (
          <ol className="space-y-5">
            {prologue.keyChanges.map((change, index) => (
              <li
                key={`${change.summary}-${change.description}`}
                className="flex gap-3 border-l-2 border-syntax-emphasis/60 py-1 pl-4"
              >
                <span
                  className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-syntax-emphasis/40 bg-syntax-emphasis/15 font-mono font-medium text-syntax-emphasis text-xs tabular-nums"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm leading-6">
                    <span className="sr-only">{index + 1}. </span>
                    {change.summary}
                  </p>
                  <p className="mt-2 text-muted-foreground text-sm leading-7">
                    {change.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground text-sm leading-7">
            핵심 변경이 제공되지 않았습니다.
          </p>
        )}
      </SummarySection>
      <SummarySection icon={ScanSearch} title="리뷰 포커스" tone="warning">
        <div className="mb-5 flex flex-wrap items-center gap-2.5">
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 font-medium text-xs",
              complexityClasses[prologue.complexity.level],
            )}
          >
            {prologue.complexity.level}
          </span>
          <p className="text-muted-foreground text-sm leading-7">{prologue.complexity.reasoning}</p>
        </div>
        {prologue.focusAreas.length ? (
          <div className="space-y-4">
            {prologue.focusAreas.map((area) => (
              <div
                key={`${area.type}-${area.title}`}
                className="rounded-md border border-warning/25 bg-warning/5 px-4 py-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 font-medium text-xs",
                      severityClasses[area.severity],
                    )}
                  >
                    {area.severity}
                  </span>
                  <span className="font-medium text-sm">{area.title}</span>
                </div>
                <p className="mt-3 text-muted-foreground text-sm leading-7">{area.description}</p>
                {area.locations.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {area.locations.map((location) => (
                      <span
                        key={location}
                        className="rounded-md bg-muted px-2.5 py-1 font-mono text-muted-foreground text-xs"
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
          <p className="text-muted-foreground text-sm leading-7">
            별도 검토 지점이 제공되지 않았습니다.
          </p>
        )}
      </SummarySection>
    </article>
  );
}

function PlainSummaryBanner({ text }: { text: string | null }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-4 md:px-5",
        // Warning amber reads as highlighter on dark surfaces — intentional emphasis.
        text
          ? "border-warning/55 bg-warning/20 shadow-[inset_4px_0_0_0] shadow-warning"
          : "border-border bg-muted/30",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <Sparkles
          className={cn("size-4 shrink-0", text ? "text-warning" : "text-muted-foreground")}
        />
        <span
          className={cn(
            "font-mono font-medium text-[0.7rem] uppercase tracking-[0.16em]",
            text ? "text-warning" : "text-muted-foreground",
          )}
        >
          한눈에 보기
        </span>
        {text ? (
          <span className="rounded-full border border-warning/40 bg-warning/25 px-2 py-0.5 font-medium text-[10px] text-warning">
            비개발자용
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "text-sm leading-7",
          text ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {text ??
          "이 PR이 무엇을 처리하는지는 아직 요약되지 않았습니다. 재분석 후 비개발자용 한 줄 설명이 여기에 표시됩니다."}
      </p>
    </div>
  );
}

/** Distinct accent per prologue section so scanners can jump by color. */
const sectionToneClasses = {
  info: {
    iconWrap: "border-info/35 bg-info/15 text-info",
    title: "text-info",
  },
  primary: {
    iconWrap: "border-primary/35 bg-primary/15 text-primary",
    title: "text-primary",
  },
  emphasis: {
    iconWrap: "border-syntax-emphasis/40 bg-syntax-emphasis/15 text-syntax-emphasis",
    title: "text-syntax-emphasis",
  },
  warning: {
    iconWrap: "border-warning/40 bg-warning/15 text-warning",
    title: "text-warning",
  },
} as const;

type SectionTone = keyof typeof sectionToneClasses;

function SummarySection({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: LucideIcon;
  title: string;
  tone: SectionTone;
  children: React.ReactNode;
}) {
  const toneClass = sectionToneClasses[tone];
  return (
    <section>
      <h3 className={cn("mb-3.5 flex items-center gap-2.5 font-medium text-sm", toneClass.title)}>
        <span
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-md border",
            toneClass.iconWrap,
          )}
        >
          <Icon className="size-3.5" />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}
