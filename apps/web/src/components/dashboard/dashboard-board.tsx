import { Clock3, GitMerge, GitPullRequest, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  ReadingSpine,
  SizePill,
  sizeMeta,
  type SizeMeta,
} from "@/components/dashboard/dashboard-card-meta";
import { DashboardColumnSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { Button } from "@/components/ui/button";
import type {
  DashboardBucket,
  DashboardCardProperty,
  DashboardCompletedPull,
  DashboardLayoutMode,
  DashboardPull,
} from "@/lib/dashboard-api";
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
  layout: DashboardLayoutMode;
  showEmptyColumns: boolean;
  highlightMyPrs: boolean;
  visibleProperties: DashboardCardProperty[];
  columns: DashboardColumnState[];
  onRetryReview: (pull: DashboardPull) => void;
}

type CardFooterPull = Pick<DashboardPull, "author" | "additions" | "deletions"> &
  Partial<Pick<DashboardPull, "chapterCount" | "viewedChapters">>;

export const defaultDashboardBoardLabels: DashboardBoardLabels = {
  ready: "Ready to review",
  yours: "Your pull requests",
  other: "Other",
  completed: "Complete",
};

export function DashboardBoard({
  layout,
  showEmptyColumns,
  highlightMyPrs,
  visibleProperties,
  columns,
  onRetryReview,
}: DashboardBoardProps) {
  const visibleColumns = showEmptyColumns
    ? columns
    : columns.filter(
        (column) => column.isInitialLoading || column.count > 0 || column.items.length > 0,
      );

  return (
    <div className={dashboardBoardGridClass(layout)}>
      {visibleColumns.map((column) => (
        <DashboardColumn
          key={column.bucket}
          column={column}
          highlightMyPrs={highlightMyPrs}
          visibleProperties={visibleProperties}
          onRetryReview={onRetryReview}
        />
      ))}
    </div>
  );
}

function DashboardColumn({
  column,
  highlightMyPrs,
  visibleProperties,
  onRetryReview,
}: {
  column: DashboardColumnState;
  highlightMyPrs: boolean;
  visibleProperties: DashboardCardProperty[];
  onRetryReview: (pull: DashboardPull) => void;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <h2 className="font-sans text-base font-medium leading-none text-foreground/90">
          {column.title}
        </h2>
        <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">
          {String(column.count).padStart(2, "0")}
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
            <CompletedPullCard
              key={pull.id}
              pull={pull as DashboardCompletedPull}
              visibleProperties={visibleProperties}
            />
          ) : (
            <OpenPullCard
              key={pull.id}
              pull={pull as DashboardPull}
              highlighted={highlightMyPrs && column.bucket === "yours"}
              visibleProperties={visibleProperties}
              onRetryReview={onRetryReview}
            />
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

function OpenPullCard({
  pull,
  highlighted,
  visibleProperties,
  onRetryReview,
}: {
  pull: DashboardPull;
  highlighted: boolean;
  visibleProperties: DashboardCardProperty[];
  onRetryReview: (pull: DashboardPull) => void;
}) {
  const size = sizeMeta(pull.changedFiles, pull.additions + pull.deletions);
  const failed = pull.analysisStatus === "failed";
  const retrying = pull.analysisStatus === "retrying";
  const StatusIcon = failed ? X : retrying ? RotateCcw : Clock3;

  return (
    <div className={dashboardOpenPullCardClass(highlighted)}>
      <Link href={`/${pull.org}/${pull.repo}/pull/${pull.number}`} className="block">
        <CardHeader
          icon={<GitPullRequest className="size-3.5 text-warning" />}
          repo={pull.repo}
          number={pull.number}
          trailing={
            <StatusIcon className={cn("size-3.5", failed ? "text-destructive" : "text-warning")} />
          }
          time={pull.updatedAt}
          title={pull.title}
          visibleProperties={visibleProperties}
        />
        <CardFooter pull={pull} size={size} visibleProperties={visibleProperties} />
      </Link>
      {failed ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="mt-4"
          onClick={() => onRetryReview(pull)}
        >
          Retry
        </Button>
      ) : null}
    </div>
  );
}

function CompletedPullCard({
  pull,
  visibleProperties,
}: {
  pull: DashboardCompletedPull;
  visibleProperties: DashboardCardProperty[];
}) {
  const size = sizeMeta(pull.changedFiles, pull.additions + pull.deletions);
  const StateIcon =
    pull.githubStatus === "merged" ? GitMerge : pull.githubStatus === "closed" ? X : GitPullRequest;

  return (
    <Link
      href={`/${pull.org}/${pull.repo}/pull/${pull.number}`}
      className="group relative rounded-lg border border-border bg-background/40 p-4 transition-colors hover:border-primary/35"
    >
      <CardHeader
        icon={
          <StateIcon
            className={cn(
              "size-3.5",
              pull.githubStatus === "merged"
                ? "text-syntax-emphasis"
                : pull.githubStatus === "closed"
                  ? "text-destructive"
                  : "text-primary",
            )}
          />
        }
        repo={pull.repo}
        number={pull.number}
        time={pull.completedAt}
        title={pull.title}
        visibleProperties={visibleProperties}
      />
      <CardFooter pull={pull} size={size} visibleProperties={visibleProperties} />
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
  visibleProperties,
}: {
  icon: ReactNode;
  repo: string;
  number: number;
  trailing?: ReactNode;
  time: string;
  title: string;
  visibleProperties: DashboardCardProperty[];
}) {
  const identity = dashboardCardIdentity(repo, number, visibleProperties);
  const { updatedDate } = dashboardVisibleCardSections(visibleProperties);

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-mono text-[0.7rem] tracking-wide text-muted-foreground">
          {icon}
          {identity ? <span className="truncate">{identity}</span> : null}
          {trailing}
        </div>
        <h3 className="mt-2.5 line-clamp-2 font-sans text-[1.05rem] font-medium leading-snug text-foreground/95 transition-colors group-hover:text-primary">
          {title}
        </h3>
      </div>
      {updatedDate ? (
        <span className="shrink-0 font-mono text-[0.7rem] text-muted-foreground">{time}</span>
      ) : null}
    </div>
  );
}

function CardFooter({
  pull,
  size,
  visibleProperties,
}: {
  pull: CardFooterPull;
  size: SizeMeta;
  visibleProperties: DashboardCardProperty[];
}) {
  const { author, lines, chapters } = dashboardVisibleCardSections(visibleProperties);
  const showChapters = chapters && typeof pull.chapterCount === "number";

  if (!author && !lines && !showChapters) {
    return null;
  }

  return (
    <>
      {lines ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <SizePill meta={size} />
        </div>
      ) : null}
      <div className="mt-4 flex items-center gap-3 text-xs">
        {author ? <span className="truncate text-warning">{pull.author}</span> : null}
        {lines ? (
          <>
            <span className="text-primary">+{pull.additions}</span>
            <span className="text-destructive">-{pull.deletions}</span>
          </>
        ) : null}
        {showChapters ? (
          <ReadingSpine total={pull.chapterCount ?? 0} viewed={pull.viewedChapters ?? 0} />
        ) : null}
      </div>
    </>
  );
}

export function dashboardBoardGridClass(layout: DashboardLayoutMode) {
  return layout === "list" ? "grid gap-4" : "grid gap-5 md:grid-cols-2 2xl:grid-cols-4";
}

export function dashboardOpenPullCardClass(highlighted: boolean) {
  return cn(
    "group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/35",
    highlighted && "border-primary/45 bg-primary/5",
  );
}

export function dashboardCardIdentity(
  repo: string,
  number: number,
  visibleProperties: DashboardCardProperty[],
) {
  const repoPart = visibleProperties.includes("Repository") ? repo : "";
  const idPart = visibleProperties.includes("ID") ? `#${number}` : "";
  return `${repoPart}${idPart}`;
}

export function dashboardVisibleCardSections(visibleProperties: DashboardCardProperty[]) {
  return {
    author: visibleProperties.includes("Author"),
    lines: visibleProperties.includes("Lines changed"),
    chapters: visibleProperties.includes("Chapters"),
    updatedDate: visibleProperties.includes("Updated date"),
  };
}
