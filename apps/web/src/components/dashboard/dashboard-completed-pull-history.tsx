"use client";

import { useEffect, useRef } from "react";
import { ChevronRight, GitMerge, X } from "lucide-react";
import Link from "next/link";

import { SizePill, sizeMeta } from "@/components/dashboard/dashboard-card-meta";
import { DashboardSkeletonCard } from "@/components/dashboard/dashboard-skeleton";
import type { DashboardCardProperty, DashboardCompletedPull } from "@/lib/dashboard-api";

export function DashboardCompletedPullHistory({
  pulls,
  total,
  hasMore,
  isLoadingMore,
  onLoadMore,
  visibleProperties,
}: {
  pulls: DashboardCompletedPull[];
  total: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  visibleProperties: DashboardCardProperty[];
}) {
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollRegion = scrollRegionRef.current;
    const sentinel = sentinelRef.current;
    if (!scrollRegion || !sentinel || !hasMore || isLoadingMore) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onLoadMore();
        }
      },
      { root: scrollRegion, rootMargin: "160px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

  return (
    <div
      ref={scrollRegionRef}
      className="max-h-96 space-y-2 overflow-y-auto pr-1"
      aria-label="Complete pull request history"
    >
      <p className="px-1 font-mono text-[0.65rem] tabular-nums text-muted-foreground">
        Showing {pulls.length} of {total} completed
      </p>
      {pulls.map((pull) => (
        <CompletedPullRow key={pull.id} pull={pull} visibleProperties={visibleProperties} />
      ))}
      {hasMore ? <div ref={sentinelRef} aria-hidden="true" /> : null}
      {isLoadingMore ? <DashboardSkeletonCard /> : null}
      {!hasMore && !isLoadingMore ? (
        <p className="py-1 text-center text-xs text-muted-foreground">End of complete history.</p>
      ) : null}
    </div>
  );
}

function CompletedPullRow({
  pull,
  visibleProperties,
}: {
  pull: DashboardCompletedPull;
  visibleProperties: DashboardCardProperty[];
}) {
  const size = sizeMeta(pull.changedFiles, pull.additions + pull.deletions);
  const StateIcon = pull.githubStatus === "merged" ? GitMerge : X;
  return (
    <Link
      href={`/${pull.org}/${pull.repo}/pull/${pull.number}`}
      className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-background/35 p-3 transition-colors hover:border-primary/35"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-mono text-[0.65rem] text-muted-foreground">
          <StateIcon className="size-3.5 text-syntax-emphasis" />
          {visibleProperties.includes("Repository") ? pull.repo : ""}
          {visibleProperties.includes("ID") ? `#${pull.number}` : ""}
          {pull.completedAt}
        </p>
        <h3 className="mt-1 truncate text-sm font-medium text-foreground group-hover:text-primary">
          {pull.title}
        </h3>
        {visibleProperties.includes("Lines changed") ? (
          <div className="mt-2 flex items-center gap-2">
            <SizePill meta={size} />
            <span className="font-mono text-xs text-primary">+{pull.additions}</span>
            <span className="font-mono text-xs text-destructive">-{pull.deletions}</span>
          </div>
        ) : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </Link>
  );
}
