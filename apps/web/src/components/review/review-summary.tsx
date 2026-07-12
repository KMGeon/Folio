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
  // Amber so medium is not a grey “no signal” chip.
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

/** Icon-only accents — titles stay foreground so sections don’t look rainbow. */
const sectionIconClasses = {
  info: "text-info",
  primary: "text-primary",
  emphasis: "text-syntax-emphasis",
  warning: "text-warning",
} as const;

type SectionIconTone = keyof typeof sectionIconClasses;

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
      <PlainSummaryBlock text={plainSummary} />

      <SummarySection icon={GitPullRequestArrow} title="왜 이 PR인가?" iconTone="info">
        <p className={cn("text-sm leading-7", !prologue.motivation && "text-muted-foreground")}>
          {prologue.motivation ?? "변경 내용에서 명확히 확인되지 않았습니다."}
        </p>
      </SummarySection>
      <SummarySection icon={Braces} title="무엇을 하는가" iconTone="primary">
        <p className={cn("text-sm leading-7", !prologue.outcome && "text-muted-foreground")}>
          {prologue.outcome ?? "변경 내용에서 명확히 확인되지 않았습니다."}
        </p>
        {prologue.diagram ? (
          <div className="mt-4">
            <MermaidDiagram source={prologue.diagram} label="PR 변경 흐름도" />
          </div>
        ) : null}
      </SummarySection>
      <SummarySection icon={ListChecks} title="핵심 변경" iconTone="emphasis">
        {prologue.keyChanges.length ? (
          <div className="space-y-5">
            {prologue.keyChanges.map((change) => (
              <div
                key={`${change.summary}-${change.description}`}
                className="border-l-2 border-primary/50 py-1 pl-5"
              >
                <p className="font-medium text-sm leading-6">{change.summary}</p>
                <p className="mt-2 text-muted-foreground text-sm leading-7">{change.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm leading-7">
            핵심 변경이 제공되지 않았습니다.
          </p>
        )}
      </SummarySection>
      <SummarySection icon={ScanSearch} title="리뷰 포커스" iconTone="warning">
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
                className="rounded-md border bg-muted/20 px-4 py-4"
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

/** Quiet TL;DR — same hierarchy as other sections; icon accent only, no callout box. */
function PlainSummaryBlock({ text }: { text: string | null }) {
  return (
    <SummarySection icon={Sparkles} title="한눈에 보기" iconTone="warning">
      <p className={cn("text-sm leading-7", text ? "text-foreground" : "text-muted-foreground")}>
        {text ??
          "이 PR이 무엇을 처리하는지는 아직 요약되지 않았습니다. 재분석 후 한 줄 설명이 여기에 표시됩니다."}
      </p>
    </SummarySection>
  );
}

function SummarySection({
  icon: Icon,
  title,
  iconTone,
  children,
}: {
  icon: LucideIcon;
  title: string;
  iconTone: SectionIconTone;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3.5 flex items-center gap-2.5 font-medium text-foreground text-sm">
        <Icon className={cn("size-4 shrink-0", sectionIconClasses[iconTone])} />
        {title}
      </h3>
      {children}
    </section>
  );
}
