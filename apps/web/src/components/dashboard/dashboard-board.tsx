import { Check, GitMerge, GitPullRequest, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

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
}

type SizeMeta = { label: string; tone: "green" | "amber" | "red" };
type CardFooterPull = Pick<DashboardPull, "author" | "additions" | "deletions"> &
  Partial<Pick<DashboardPull, "chapterCount" | "viewedChapters">>;

export const defaultDashboardBoardLabels: DashboardBoardLabels = {
  ready: "Ready to review",
  yours: "Your pull requests",
  other: "Other",
  completed: "Recently completed",
};

export function DashboardBoard({
  layout,
  showEmptyColumns,
  highlightMyPrs,
  visibleProperties,
  columns,
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
        />
      ))}
    </div>
  );
}

function DashboardColumn({
  column,
  highlightMyPrs,
  visibleProperties,
}: {
  column: DashboardColumnState;
  highlightMyPrs: boolean;
  visibleProperties: DashboardCardProperty[];
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
}: {
  pull: DashboardPull;
  highlighted: boolean;
  visibleProperties: DashboardCardProperty[];
}) {
  const size = sizeMeta(pull.changedFiles, pull.additions + pull.deletions);
  const ready = pull.status === "ready";
  const StatusIcon = ready ? Check : X;

  return (
    <Link
      href={`/${pull.org}/${pull.repo}/pull/${pull.number}/chapters/1`}
      className={dashboardOpenPullCardClass(highlighted)}
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
        visibleProperties={visibleProperties}
      />
      <CardFooter pull={pull} size={size} visibleProperties={visibleProperties} />
    </Link>
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
    "group rounded-lg border bg-card p-4 transition-colors hover:border-primary/35",
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

/**
 * Signature "reading spine": one hairline tick per chapter, filled once viewed —
 * the PR shown as a book you read down. Chapter order is real, so the sequence
 * carries meaning rather than decorating.
 */
function ReadingSpine({ total, viewed }: { total: number; viewed: number }) {
  if (total <= 0) {
    return null;
  }
  const shown = Math.min(total, 14);
  return (
    <span
      className="flex items-center gap-[3px]"
      title={`${viewed}/${total} chapters read`}
      aria-label={`${total}개 챕터 중 ${viewed}개 읽음`}
    >
      {Array.from({ length: shown }).map((_, i) => (
        <span
          key={i}
          className={cn("h-3.5 w-[2px] rounded-full", i < viewed ? "bg-primary" : "bg-border")}
        />
      ))}
      <span className="ml-1.5 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
        {viewed}/{total}
      </span>
    </span>
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
