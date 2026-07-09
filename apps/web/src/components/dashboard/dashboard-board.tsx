import {
  Check,
  GitMerge,
  GitPullRequest,
  ListFilter,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { DashboardCompletedPull, DashboardPull } from "@/lib/dashboard-api";
import { cn } from "@/lib/utils";

export interface DashboardBoardLabels {
  ready: string;
  yours: string;
  other: string;
  completed: string;
}

export interface DashboardBoardProps {
  readyPulls: DashboardPull[];
  yourPulls: DashboardPull[];
  otherPulls: DashboardPull[];
  completedPulls: DashboardCompletedPull[];
  labels?: DashboardBoardLabels;
}

interface ColumnProps {
  title: string;
  count: number;
  children: ReactNode;
  emptyText: string;
  dashed?: boolean;
}

type SizeTone = "green" | "amber" | "red";

interface SizeMeta {
  label: string;
  tone: SizeTone;
}

const defaultLabels: DashboardBoardLabels = {
  ready: "Ready to review",
  yours: "Your pull requests",
  other: "Other",
  completed: "Recently completed",
};

export function DashboardBoard({
  readyPulls,
  yourPulls,
  otherPulls,
  completedPulls,
  labels = defaultLabels,
}: DashboardBoardProps) {
  return (
    <div className="space-y-6">
      <DashboardSearchBar />
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
        <DashboardColumn
          title={labels.ready}
          count={readyPulls.length}
          emptyText="No review-ready pull requests."
        >
          {readyPulls.map((pull) => (
            <OpenPullCard key={pull.id} pull={pull} />
          ))}
        </DashboardColumn>

        <DashboardColumn
          title={labels.yours}
          count={yourPulls.length}
          emptyText="No open pull requests authored by you."
        >
          {yourPulls.map((pull) => (
            <OpenPullCard key={pull.id} pull={pull} />
          ))}
        </DashboardColumn>

        <DashboardColumn
          title={labels.other}
          count={otherPulls.length}
          emptyText="No other open PRs."
        >
          {otherPulls.map((pull) => (
            <OpenPullCard key={pull.id} pull={pull} />
          ))}
        </DashboardColumn>

        <DashboardColumn
          title={labels.completed}
          count={completedPulls.length}
          emptyText="No recently completed pull requests."
          dashed
        >
          {completedPulls.map((pull) => (
            <CompletedPullCard key={pull.id} pull={pull} />
          ))}
        </DashboardColumn>
      </div>
    </div>
  );
}

function DashboardColumn({ title, count, children, emptyText, dashed = false }: ColumnProps) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="grid gap-3">
        {count > 0 ? (
          children
        ) : (
          <div
            className={cn(
              "rounded-lg border bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground",
              dashed && "border-dashed",
            )}
          >
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}

function OpenPullCard({ pull }: { pull: DashboardPull }) {
  const size = sizeMeta(pull.changedFiles, pull.additions + pull.deletions);
  const ready = pull.status === "ready";
  const StatusIcon = ready ? Check : X;

  return (
    <Link
      href={`/${pull.org}/${pull.repo}/pull/${pull.number}/chapters/1`}
      className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/35"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitPullRequest className="size-3.5 text-warning" />
            <span className="truncate">
              {pull.repo}#{pull.number}
            </span>
            <StatusIcon className={cn("size-3.5", ready ? "text-primary" : "text-destructive")} />
          </div>
          <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-5 group-hover:text-primary">
            {pull.title}
          </h3>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{pull.updatedAt}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <SizePill meta={size} />
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs">
        <span className="truncate text-warning">{pull.author}</span>
        <span className="text-primary">+{pull.additions}</span>
        <span className="text-destructive">-{pull.deletions}</span>
      </div>
    </Link>
  );
}

function CompletedPullCard({ pull }: { pull: DashboardCompletedPull }) {
  const size = sizeMeta(pull.changedFiles, pull.additions + pull.deletions);
  const StateIcon = pull.completedState === "merged" ? GitMerge : X;

  return (
    <Link
      href={`/${pull.org}/${pull.repo}/pull/${pull.number}`}
      className="group rounded-lg border border-dashed bg-background/35 p-4 transition-colors hover:border-primary/35"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <StateIcon
              className={cn(
                "size-3.5",
                pull.completedState === "merged" ? "text-syntax-emphasis" : "text-destructive",
              )}
            />
            <span className="truncate">
              {pull.repo}#{pull.number}
            </span>
          </div>
          <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-5 group-hover:text-primary">
            {pull.title}
          </h3>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{pull.completedAt}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <SizePill meta={size} />
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs">
        <span className="truncate text-warning">{pull.author}</span>
        <span className="text-primary">+{pull.additions}</span>
        <span className="text-destructive">-{pull.deletions}</span>
      </div>
    </Link>
  );
}

function DashboardSearchBar() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-muted-foreground">
        <Search className="size-4 shrink-0" />
        <span className="truncate text-sm">Search pull requests...</span>
      </div>
      <Button
        type="button"
        aria-label="Filter pull requests"
        variant="ghost"
        size="icon"
        disabled
        className="size-9 shrink-0 text-muted-foreground opacity-70"
      >
        <ListFilter className="size-4" />
      </Button>
      <Button
        type="button"
        aria-label="Sort pull requests"
        variant="ghost"
        size="icon"
        disabled
        className="size-9 shrink-0 text-muted-foreground opacity-70"
      >
        <SlidersHorizontal className="size-4" />
      </Button>
    </div>
  );
}

function SizePill({ meta }: { meta: SizeMeta }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.tone === "green" && "border-primary/30 bg-primary/10 text-primary",
        meta.tone === "amber" && "border-warning/40 bg-warning/10 text-warning",
        meta.tone === "red" && "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      {meta.label}
    </span>
  );
}

function sizeMeta(changedFiles: number, churn: number): SizeMeta {
  if (changedFiles <= 2 && churn <= 30) {
    return { label: "size/XS", tone: "green" };
  }
  if (changedFiles <= 5 && churn <= 150) {
    return { label: "size/S", tone: "green" };
  }
  if (changedFiles <= 12 && churn <= 600) {
    return { label: "size/M", tone: "amber" };
  }
  if (changedFiles <= 25 && churn <= 1500) {
    return { label: "size/L", tone: "amber" };
  }
  return { label: "size/XXL", tone: "red" };
}
