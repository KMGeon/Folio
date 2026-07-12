import { Braces, GitPullRequestArrow, ListChecks, ScanSearch, type LucideIcon } from "lucide-react";
import React from "react";

import type { ComplexityLevel, FocusAreaSeverity, Prologue } from "@folio/types";

import { MermaidDiagram } from "@/components/review/mermaid-diagram";
import { cn } from "@/lib/utils";

const complexityClasses: Record<ComplexityLevel, string> = {
  low: "border-primary/30 bg-primary/10 text-primary",
  medium: "border-border bg-muted text-foreground",
  high: "border-destructive/30 bg-destructive/10 text-destructive",
  "very-high": "border-destructive/40 bg-destructive/15 text-destructive",
};

const severityClasses: Record<FocusAreaSeverity, string> = {
  critical: "border-destructive/40 bg-destructive/15 text-destructive",
  high: "border-destructive/30 bg-destructive/10 text-destructive",
  medium: "border-border bg-muted text-foreground",
  info: "border-primary/30 bg-primary/10 text-primary",
};

export function ReviewSummary({ prologue }: { prologue: Prologue }) {
  return (
    <article className="space-y-6 rounded-lg border bg-card p-5 md:p-6">
      <SummarySection icon={GitPullRequestArrow} title="왜 이 PR인가?">
        <p className={cn("text-sm leading-7", !prologue.motivation && "text-muted-foreground")}>
          {prologue.motivation ?? "변경 내용에서 명확히 확인되지 않았습니다."}
        </p>
      </SummarySection>
      <SummarySection icon={Braces} title="무엇을 하는가">
        <p className={cn("text-sm leading-7", !prologue.outcome && "text-muted-foreground")}>
          {prologue.outcome ?? "변경 내용에서 명확히 확인되지 않았습니다."}
        </p>
        {prologue.diagram ? (
          <div className="mt-4">
            <MermaidDiagram source={prologue.diagram} label="PR 변경 흐름도" />
          </div>
        ) : null}
      </SummarySection>
      <SummarySection icon={ListChecks} title="핵심 변경">
        {prologue.keyChanges.length ? (
          <div className="space-y-4">
            {prologue.keyChanges.map((change) => (
              <div
                key={`${change.summary}-${change.description}`}
                className="border-l-2 border-primary/50 py-0.5 pl-4"
              >
                <p className="font-medium text-sm leading-6">{change.summary}</p>
                <p className="mt-1.5 text-muted-foreground text-sm leading-7">
                  {change.description}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm leading-7">
            핵심 변경이 제공되지 않았습니다.
          </p>
        )}
      </SummarySection>
      <SummarySection icon={ScanSearch} title="리뷰 포커스">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
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
          <div className="space-y-3.5">
            {prologue.focusAreas.map((area) => (
              <div
                key={`${area.type}-${area.title}`}
                className="rounded-md border bg-muted/20 px-3.5 py-3.5"
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
                <p className="mt-2.5 text-muted-foreground text-sm leading-7">{area.description}</p>
                {area.locations.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {area.locations.map((location) => (
                      <span
                        key={location}
                        className="rounded-md bg-muted px-2 py-1 font-mono text-muted-foreground text-xs"
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

function SummarySection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2.5 font-medium text-foreground text-sm">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        {title}
      </h3>
      {children}
    </section>
  );
}
