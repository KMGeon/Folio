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
    <article className="space-y-4 rounded-lg border bg-card p-4">
      <SummarySection icon={GitPullRequestArrow} title="Why this PR?">
        <p className={cn("text-sm leading-6", !prologue.motivation && "text-muted-foreground")}>
          {prologue.motivation ?? "변경 내용에서 명확히 확인되지 않았습니다."}
        </p>
      </SummarySection>
      <SummarySection icon={Braces} title="What it does">
        <p className={cn("text-sm leading-6", !prologue.outcome && "text-muted-foreground")}>
          {prologue.outcome ?? "변경 내용에서 명확히 확인되지 않았습니다."}
        </p>
        {prologue.diagram ? (
          <MermaidDiagram source={prologue.diagram} label="PR 변경 흐름도" />
        ) : null}
      </SummarySection>
      <SummarySection icon={ListChecks} title="Key changes">
        {prologue.keyChanges.length ? (
          <div className="space-y-3">
            {prologue.keyChanges.map((change) => (
              <div
                key={`${change.summary}-${change.description}`}
                className="border-l-2 border-primary/50 pl-3"
              >
                <p className="font-medium text-sm">{change.summary}</p>
                <p className="mt-1 text-muted-foreground text-sm leading-6">{change.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">핵심 변경이 제공되지 않았습니다.</p>
        )}
      </SummarySection>
      <SummarySection icon={ScanSearch} title="Review focus">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 font-medium text-xs",
              complexityClasses[prologue.complexity.level],
            )}
          >
            {prologue.complexity.level}
          </span>
          <p className="text-muted-foreground text-sm leading-6">{prologue.complexity.reasoning}</p>
        </div>
        {prologue.focusAreas.length ? (
          <div className="space-y-3">
            {prologue.focusAreas.map((area) => (
              <div key={`${area.type}-${area.title}`} className="rounded-md border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 font-medium text-xs",
                      severityClasses[area.severity],
                    )}
                  >
                    {area.severity}
                  </span>
                  <span className="font-medium text-sm">{area.title}</span>
                </div>
                <p className="mt-2.5 text-muted-foreground text-sm leading-6">{area.description}</p>
                {area.locations.length ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {area.locations.map((location) => (
                      <span
                        key={location}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs"
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
          <p className="text-muted-foreground text-sm">별도 검토 지점이 제공되지 않았습니다.</p>
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
      <h3 className="mb-2.5 flex items-center gap-2 font-medium text-foreground text-sm">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </h3>
      {children}
    </section>
  );
}
