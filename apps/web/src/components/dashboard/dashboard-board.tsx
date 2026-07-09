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

import { DashboardColumnSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { Button } from "@/components/ui/button";
import type { DashboardBucket, DashboardCompletedPull, DashboardPull } from "@/lib/dashboard-api";
import { cn } from "@/lib/utils";

export interface DashboardBoardLabels {
  ready: string;
  yours: string;
  other: string;
  completed: string;
}

export interface DashboardColumnState {
  bucket: DashboardBucket;
  title: string;
  count: number;
  items: (DashboardPull | DashboardCompletedPull)[];
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  emptyText: string;
  dashed?: boolean;
  sentinelRef: (node: HTMLDivElement | null) => void;
  onRetry: () => void;
}

export interface DashboardBoardProps {
  query: string;
  showEmptyColumns: boolean;
  columns: DashboardColumnState[];
  onQueryChange: (value: string) => void;
  onFilterClick: () => void;
  onSortClick: () => void;
}

type SizeTone = "green" | "amber" | "red";

interface SizeMeta {
  label: string;
  tone: SizeTone;
}

export const defaultDashboardBoardLabels: DashboardBoardLabels = {
  ready: "Ready to review",
  yours: "Your pull requests",
  other: "Other",
  completed: "Recently completed",
};

export function DashboardBoard({
  query,
  showEmptyColumns,
  columns,
  onQueryChange,
  onFilterClick,
  onSortClick,
}: DashboardBoardProps) {
  const visibleColumns = showEmptyColumns
    ? columns
    : columns.filter(
        (column) => column.isInitialLoading || column.count > 0 || column.items.length > 0,
      );

  return (
    <div className="space-y-6">
      <DashboardSearchBar
        query={query}
        onQueryChange={onQueryChange}
        onFilterClick={onFilterClick}
        onSortClick={onSortClick}
      />
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
        {visibleColumns.map((column) => (
          <DashboardColumn key={column.bucket} column={column} />
        ))}
      </div>
    </div>
  );
}

function DashboardColumn({ column }: { column: DashboardColumnState }) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{column.title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {column.count}
        </span>
      </div>
      <div className="grid gap-3">
        {column.isInitialLoading ? <DashboardColumnSkeleton dashed={column.dashed} /> : null}
        {!column.isInitialLoading && column.error ? (
          <div className="rounded-lg border bg-card/40 px-4 py-5 text-center text-xs text-muted-foreground">
            <p>{column.error}</p>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="mt-3"
              onClick={column.onRetry}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {!column.isInitialLoading && !column.error && column.items.length === 0 ? (
          <div
            className={cn(
              "rounded-lg border bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground",
              column.dashed && "border-dashed",
            )}
          >
            {column.emptyText}
          </div>
        ) : null}
        {column.items.map((pull) =>
          column.bucket === "completed" ? (
            <CompletedPullCard key={pull.id} pull={pull as DashboardCompletedPull} />
          ) : (
            <OpenPullCard key={pull.id} pull={pull as DashboardPull} />
          ),
        )}
        {column.isLoadingMore ? <DashboardColumnSkeleton dashed={column.dashed} /> : null}
        {column.hasMore ? (
          <div ref={column.sentinelRef} className="h-1" aria-hidden="true" />
        ) : null}
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
      <CardHeader
        icon={<GitPullRequest className="size-3.5 text-warning" />}
        repo={pull.repo}
        number={pull.number}
        trailing={
          <StatusIcon className={cn("size-3.5", ready ? "text-primary" : "text-destructive")} />
        }
        time={pull.updatedAt}
        title={pull.title}
      />
      <CardFooter pull={pull} size={size} />
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
      <CardHeader
        icon={
          <StateIcon
            className={cn(
              "size-3.5",
              pull.completedState === "merged" ? "text-syntax-emphasis" : "text-destructive",
            )}
          />
        }
        repo={pull.repo}
        number={pull.number}
        time={pull.completedAt}
        title={pull.title}
      />
      <CardFooter pull={pull} size={size} />
    </Link>
  );
}

function CardHeader({
  icon,
  repo,
  number,
  trailing,
  time,
  title,
}: {
  icon: ReactNode;
  repo: string;
  number: number;
  trailing?: ReactNode;
  time: string;
  title: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span className="truncate">
            {repo}#{number}
          </span>
          {trailing}
        </div>
        <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-5 group-hover:text-primary">
          {title}
        </h3>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{time}</span>
    </div>
  );
}

function CardFooter({
  pull,
  size,
}: {
  pull: Pick<DashboardPull, "author" | "additions" | "deletions">;
  size: SizeMeta;
}) {
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        <SizePill meta={size} />
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs">
        <span className="truncate text-warning">{pull.author}</span>
        <span className="text-primary">+{pull.additions}</span>
        <span className="text-destructive">-{pull.deletions}</span>
      </div>
    </>
  );
}

function DashboardSearchBar({
  query,
  onQueryChange,
  onFilterClick,
  onSortClick,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onFilterClick: () => void;
  onSortClick: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-muted-foreground">
        <Search className="size-4 shrink-0" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search pull requests..."
          aria-label="Search pull requests"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <Button
        type="button"
        aria-label="Filter pull requests"
        variant="ghost"
        size="icon"
        className="size-9 shrink-0 text-muted-foreground"
        onClick={onFilterClick}
      >
        <ListFilter className="size-4" />
      </Button>
      <Button
        type="button"
        aria-label="Sort pull requests"
        variant="ghost"
        size="icon"
        className="size-9 shrink-0 text-muted-foreground"
        onClick={onSortClick}
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
