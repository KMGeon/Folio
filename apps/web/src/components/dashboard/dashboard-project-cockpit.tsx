"use client";

import { ArrowRight, CheckCircle2, CircleAlert, Clock3, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ReadingSpine, SizePill, sizeMeta } from "@/components/dashboard/dashboard-card-meta";
import { DashboardCompletedPullHistory } from "@/components/dashboard/dashboard-completed-pull-history";
import {
  dashboardCockpitStates,
  dashboardProjectCounts,
  dashboardProjectName,
  dashboardProjectPullsForState,
  type DashboardCockpitState,
  type DashboardProjectData,
} from "@/components/dashboard/dashboard-project-desk-model";
import { DashboardColumnSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { RiskPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import type {
  DashboardCardProperty,
  DashboardCompletedPull,
  DashboardPull,
} from "@/lib/dashboard-api";
import { cn } from "@/lib/utils";

const cockpitLabels: Record<DashboardCockpitState, string> = {
  attention: "Attention",
  ready: "Ready",
  reviewing: "Reviewing",
  processing: "Processing",
  complete: "Complete",
};

export function DashboardProjectCockpit({
  project,
  focus,
  onFocusChange,
  visibleProperties,
  onRetryReview,
  completedLoadingMore,
  onLoadMoreCompleted,
}: {
  project: DashboardProjectData;
  focus: DashboardCockpitState;
  onFocusChange: (focus: DashboardCockpitState) => void;
  visibleProperties: DashboardCardProperty[];
  onRetryReview: (pull: DashboardPull) => void;
  completedLoadingMore: boolean;
  onLoadMoreCompleted: () => void;
}) {
  const name = dashboardProjectName(project.repo.fullName);
  const counts = dashboardProjectCounts(project);
  const hasOpenWork = counts.attention + counts.ready + counts.reviewing + counts.processing > 0;
  const pulls = dashboardProjectPullsForState(project, focus);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card/35">
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-foreground">{name}</h2>
          <p className="truncate font-mono text-[0.65rem] text-muted-foreground">
            {project.repo.fullName} · Folio enabled
          </p>
        </div>
        <span className="font-mono text-[0.65rem] tabular-nums text-muted-foreground">
          {hasOpenWork ? "Cockpit active" : "Queue clear"}
        </span>
      </header>
      <CockpitTabs counts={counts} focus={focus} onFocusChange={onFocusChange} />
      <div className="space-y-3 p-4">
        {!hasOpenWork ? <DashboardQueueClearBanner name={name} /> : null}
        {project.isLoading ? <DashboardColumnSkeleton /> : null}
        {project.error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-muted-foreground">
            {project.error}
          </div>
        ) : null}
        {!project.isLoading && !project.error ? (
          <DashboardCockpitPullList
            focus={focus}
            pulls={pulls}
            visibleProperties={visibleProperties}
            onRetryReview={onRetryReview}
            completedCount={project.pages.completed.count}
            hasMoreCompleted={project.pages.completed.nextCursor !== null}
            completedLoadingMore={completedLoadingMore}
            onLoadMoreCompleted={onLoadMoreCompleted}
          />
        ) : null}
      </div>
    </section>
  );
}

function CockpitTabs({
  counts,
  focus,
  onFocusChange,
}: {
  counts: ReturnType<typeof dashboardProjectCounts>;
  focus: DashboardCockpitState;
  onFocusChange: (focus: DashboardCockpitState) => void;
}) {
  return (
    <nav
      aria-label="Cockpit state tabs"
      className="flex overflow-x-auto border-b border-border px-2 py-2"
    >
      {dashboardCockpitStates.map((state) => {
        const active = focus === state;
        return (
          <button
            key={state}
            type="button"
            aria-pressed={active}
            onClick={() => onFocusChange(state)}
            className={cn(
              "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
              active
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {cockpitLabels[state]}
            <strong
              className={cn("font-medium tabular-nums text-foreground", active && "text-primary")}
            >
              {counts[state]}
            </strong>
          </button>
        );
      })}
    </nav>
  );
}

function DashboardQueueClearBanner({ name }: { name: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <h3 className="text-sm font-medium text-foreground">Project queue is clear</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {name} has no open Folio work. Recent completed reviews remain available under Complete.
        </p>
      </div>
    </div>
  );
}

function DashboardCockpitPullList({
  focus,
  pulls,
  visibleProperties,
  onRetryReview,
  completedCount,
  hasMoreCompleted,
  completedLoadingMore,
  onLoadMoreCompleted,
}: {
  focus: DashboardCockpitState;
  pulls: (DashboardPull | DashboardCompletedPull)[];
  visibleProperties: DashboardCardProperty[];
  onRetryReview: (pull: DashboardPull) => void;
  completedCount: number;
  hasMoreCompleted: boolean;
  completedLoadingMore: boolean;
  onLoadMoreCompleted: () => void;
}) {
  if (pulls.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background/35 px-3 py-4 text-sm text-muted-foreground">
        No {cockpitLabels[focus].toLowerCase()} pull requests in this project.
      </div>
    );
  }
  if (focus === "complete") {
    return (
      <DashboardCompletedPullHistory
        pulls={pulls as DashboardCompletedPull[]}
        total={completedCount}
        hasMore={hasMoreCompleted}
        isLoadingMore={completedLoadingMore}
        onLoadMore={onLoadMoreCompleted}
        visibleProperties={visibleProperties}
      />
    );
  }
  return (
    <div className="grid gap-2">
      {(pulls as DashboardPull[]).map((pull) => (
        <OpenPullRow
          key={pull.id}
          pull={pull}
          state={focus}
          visibleProperties={visibleProperties}
          onRetryReview={onRetryReview}
        />
      ))}
    </div>
  );
}

function OpenPullRow({
  pull,
  state,
  visibleProperties,
  onRetryReview,
}: {
  pull: DashboardPull;
  state: Exclude<DashboardCockpitState, "complete">;
  visibleProperties: DashboardCardProperty[];
  onRetryReview: (pull: DashboardPull) => void;
}) {
  const size = sizeMeta(pull.changedFiles, pull.additions + pull.deletions);
  const href = `/${pull.org}/${pull.repo}/pull/${pull.number}`;
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-background/35 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-mono text-[0.65rem] text-muted-foreground">
          {visibleProperties.includes("Repository") ? `${pull.repo} ` : ""}
          {visibleProperties.includes("ID") ? `#${pull.number} · ` : ""}
          {pull.updatedAt} · {pull.author}
        </p>
        <Link
          href={href}
          className="mt-1 block truncate text-sm font-medium text-foreground hover:text-primary"
        >
          {pull.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SizePill meta={size} />
          <RiskPill risk={pull.risk} />
          {visibleProperties.includes("Chapters") ? (
            <ReadingSpine total={pull.chapterCount} viewed={pull.viewedChapters} />
          ) : null}
        </div>
      </div>
      <CockpitRowAction pull={pull} state={state} onRetryReview={onRetryReview} />
    </article>
  );
}

function CockpitRowAction({
  pull,
  state,
  onRetryReview,
}: {
  pull: DashboardPull;
  state: Exclude<DashboardCockpitState, "complete">;
  onRetryReview: (pull: DashboardPull) => void;
}) {
  const href = `/${pull.org}/${pull.repo}/pull/${pull.number}`;
  if (state === "attention" && pull.analysisStatus === "failed") {
    return (
      <Button type="button" size="xs" variant="outline" onClick={() => onRetryReview(pull)}>
        <RefreshCw />
        Retry analysis
      </Button>
    );
  }
  if (state === "attention") {
    return <CockpitActionLink href={href} label="Review changes" icon={<CircleAlert />} />;
  }
  if (state === "ready") {
    return <CockpitActionLink href={href} label="Start review" icon={<ArrowRight />} />;
  }
  if (state === "reviewing") {
    return <CockpitActionLink href={href} label="Continue" icon={<ArrowRight />} />;
  }
  return (
    <Button type="button" size="xs" variant="secondary" disabled>
      <Clock3 />
      Preparing
    </Button>
  );
}

function CockpitActionLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Button asChild size="xs">
      <Link href={href}>
        {label}
        {icon}
      </Link>
    </Button>
  );
}
