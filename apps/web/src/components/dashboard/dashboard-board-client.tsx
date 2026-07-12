"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DashboardBoard,
  type DashboardBoardLabels,
  type DashboardColumnState,
  defaultDashboardBoardLabels,
} from "@/components/dashboard/dashboard-board";
import {
  DashboardFilterPanel,
  type DashboardFilterState,
} from "@/components/dashboard/dashboard-filter-panel";
import {
  beginDashboardRequest,
  type DashboardInFlightMap,
  type DashboardLoadMode,
  type DashboardRequestEpochs,
  finishDashboardRequest,
  resetDashboardRequestScope,
} from "@/components/dashboard/dashboard-request-scope";
import { DashboardSearchBar } from "@/components/dashboard/dashboard-search-bar";
import {
  connectDashboardBoardStream,
  hasActiveReviewJobs,
  initialColumns,
  type ColumnStateMap,
} from "@/components/dashboard/dashboard-board-stream";
import {
  type DashboardBucket,
  type DashboardOpenBucket,
  type DashboardPull,
  fetchDashboardOpenPullPages,
  fetchDashboardPullPage,
} from "@/lib/dashboard-api";
import { createReview } from "@/lib/review-api";

const openBuckets = ["ready", "yours", "other"] satisfies DashboardOpenBucket[];

const bucketConfigs = [
  { bucket: "ready" },
  { bucket: "yours" },
  { bucket: "other" },
  { bucket: "completed" },
] satisfies { bucket: DashboardBucket }[];

const emptyText: Record<DashboardBucket, string> = {
  ready: "No review-ready pull requests.",
  yours: "No open pull requests authored by you.",
  other: "No other open PRs.",
  completed: "No completed Folio reviews.",
};

const initialFilters: DashboardFilterState = {
  layout: "board",
  grouping: "responsibility",
  ordering: "updated",
  direction: "desc",
  closedRange: "1d",
  showDrafts: true,
  showEmptyColumns: true,
  highlightMyPrs: true,
  visibleProperties: ["Repository", "ID", "Author", "Labels", "Lines changed", "Updated date"],
};

export function DashboardBoardClient({
  labels = defaultDashboardBoardLabels,
}: {
  labels?: DashboardBoardLabels;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columns, setColumns] = useState<ColumnStateMap>(() => initialColumns());
  const columnsRef = useRef(columns);
  const inFlightRef = useRef<DashboardInFlightMap>(new Map());
  const observers = useRef(new Map<DashboardBucket, IntersectionObserver>());
  const requestEpochsRef = useRef<DashboardRequestEpochs>({ open: 0, completed: 0 });

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const loadBucket = useCallback(
    async (
      bucket: DashboardBucket,
      mode: DashboardLoadMode,
      version = requestEpochsRef.current[bucket === "completed" ? "completed" : "open"],
    ) => {
      const requestScope = bucket === "completed" ? "completed" : "open";
      const current = columnsRef.current[bucket];
      if (mode === "append" && (!current.nextCursor || current.isLoadingMore)) {
        return;
      }

      const requestToken = beginDashboardRequest(inFlightRef.current, bucket, mode);
      if (!requestToken) {
        return;
      }

      setColumns((prev) => ({
        ...prev,
        [bucket]: {
          ...prev[bucket],
          isInitialLoading: mode === "reset",
          isLoadingMore: mode === "append",
          error: null,
          items: mode === "reset" ? [] : prev[bucket].items,
        },
      }));

      try {
        const page = await fetchDashboardPullPage({
          bucket,
          limit: 20,
          cursor: mode === "append" ? current.nextCursor : null,
          q: debouncedQuery || undefined,
          ordering: filters.ordering,
          direction: filters.direction,
          closedRange: filters.closedRange,
          showDrafts: filters.showDrafts,
        });
        if (version !== requestEpochsRef.current[requestScope]) {
          return;
        }
        setColumns((prev) => ({
          ...prev,
          [bucket]: {
            items: mode === "append" ? [...prev[bucket].items, ...page.items] : page.items,
            count: page.count,
            nextCursor: page.nextCursor,
            isInitialLoading: false,
            isLoadingMore: false,
            error: null,
          },
        }));
      } catch {
        if (version !== requestEpochsRef.current[requestScope]) {
          return;
        }
        setColumns((prev) => ({
          ...prev,
          [bucket]: {
            ...prev[bucket],
            isInitialLoading: false,
            isLoadingMore: false,
            error: "Pull requests could not be loaded.",
          },
        }));
      } finally {
        finishDashboardRequest(inFlightRef.current, bucket, mode, requestToken);
      }
    },
    [debouncedQuery, filters.closedRange, filters.direction, filters.ordering, filters.showDrafts],
  );

  const loadOpenBuckets = useCallback(
    async (version = requestEpochsRef.current.open) => {
      const requestToken = beginDashboardRequest(inFlightRef.current, "open", "reset");
      if (!requestToken) {
        return;
      }

      setColumns((prev) => {
        const next = { ...prev };
        for (const bucket of openBuckets) {
          next[bucket] = {
            ...prev[bucket],
            items: [],
            isInitialLoading: true,
            isLoadingMore: false,
            error: null,
          };
        }
        return next;
      });

      try {
        const pages = await fetchDashboardOpenPullPages({
          limit: 20,
          q: debouncedQuery || undefined,
          ordering: filters.ordering,
          direction: filters.direction,
          showDrafts: filters.showDrafts,
        });
        if (version !== requestEpochsRef.current.open) {
          return;
        }
        setColumns((prev) => {
          const next = { ...prev };
          for (const bucket of openBuckets) {
            const page = pages[bucket];
            next[bucket] = {
              items: page.items,
              count: page.count,
              nextCursor: page.nextCursor,
              isInitialLoading: false,
              isLoadingMore: false,
              error: null,
            };
          }
          return next;
        });
      } catch {
        if (version !== requestEpochsRef.current.open) {
          return;
        }
        setColumns((prev) => {
          const next = { ...prev };
          for (const bucket of openBuckets) {
            next[bucket] = {
              ...prev[bucket],
              isInitialLoading: false,
              isLoadingMore: false,
              error: "Pull requests could not be loaded.",
            };
          }
          return next;
        });
      } finally {
        finishDashboardRequest(inFlightRef.current, "open", "reset", requestToken);
      }
    },
    [debouncedQuery, filters.direction, filters.ordering, filters.showDrafts],
  );

  useEffect(() => {
    const activeObservers = observers.current;
    const openEpoch = resetDashboardRequestScope(
      inFlightRef.current,
      requestEpochsRef.current,
      "open",
    );

    void loadOpenBuckets(openEpoch);

    return () => {
      for (const bucket of openBuckets) {
        activeObservers.get(bucket)?.disconnect();
        activeObservers.delete(bucket);
      }
    };
  }, [debouncedQuery, filters.direction, filters.ordering, filters.showDrafts, loadOpenBuckets]);

  useEffect(() => {
    return connectDashboardBoardStream({
      inFlightRef,
      requestEpochsRef,
      loadOpenBuckets,
      setColumns,
    });
  }, [loadOpenBuckets]);

  useEffect(() => {
    const activeObservers = observers.current;
    const completedEpoch = resetDashboardRequestScope(
      inFlightRef.current,
      requestEpochsRef.current,
      "completed",
    );

    void loadBucket("completed", "reset", completedEpoch);

    return () => {
      activeObservers.get("completed")?.disconnect();
      activeObservers.delete("completed");
    };
  }, [
    debouncedQuery,
    filters.closedRange,
    filters.direction,
    filters.ordering,
    filters.showDrafts,
    loadBucket,
  ]);

  const hasActiveReviews = hasActiveReviewJobs(columns);
  useEffect(() => {
    if (!hasActiveReviews) {
      return;
    }
    const interval = window.setInterval(() => {
      const openEpoch = resetDashboardRequestScope(
        inFlightRef.current,
        requestEpochsRef.current,
        "open",
      );
      const completedEpoch = resetDashboardRequestScope(
        inFlightRef.current,
        requestEpochsRef.current,
        "completed",
      );
      void loadOpenBuckets(openEpoch);
      void loadBucket("completed", "reset", completedEpoch);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [hasActiveReviews, loadBucket, loadOpenBuckets]);

  const sentinelRef = useCallback(
    (bucket: DashboardBucket) => (node: HTMLDivElement | null) => {
      observers.current.get(bucket)?.disconnect();
      if (!node || !columnsRef.current[bucket].nextCursor) {
        return;
      }

      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadBucket(bucket, "append");
        }
      });
      observer.observe(node);
      observers.current.set(bucket, observer);
    },
    [loadBucket],
  );

  const boardColumns = useMemo<DashboardColumnState[]>(
    () =>
      bucketConfigs.map(({ bucket }) => ({
        bucket,
        title: labels[bucket],
        count: columns[bucket].count,
        items: columns[bucket].items,
        isInitialLoading: columns[bucket].isInitialLoading,
        isLoadingMore: columns[bucket].isLoadingMore,
        hasMore: Boolean(columns[bucket].nextCursor),
        error: columns[bucket].error,
        emptyText: emptyText[bucket],
        dashed: bucket === "completed",
        sentinelRef: sentinelRef(bucket),
        onRetry: () =>
          void (bucket === "completed" ? loadBucket(bucket, "reset") : loadOpenBuckets()),
      })),
    [columns, labels, loadBucket, loadOpenBuckets, sentinelRef],
  );

  const retryReview = useCallback(
    async (pull: DashboardPull) => {
      await createReview(pull.org, pull.repo, pull.number);
      const openEpoch = resetDashboardRequestScope(
        inFlightRef.current,
        requestEpochsRef.current,
        "open",
      );
      const completedEpoch = resetDashboardRequestScope(
        inFlightRef.current,
        requestEpochsRef.current,
        "completed",
      );
      await Promise.all([
        loadOpenBuckets(openEpoch),
        loadBucket("completed", "reset", completedEpoch),
      ]);
    },
    [loadBucket, loadOpenBuckets],
  );

  return (
    <div className="relative space-y-4">
      <DashboardSearchBar
        query={query}
        onQueryChange={setQuery}
        onFilterClick={() => setFilterOpen((open) => !open)}
        onSortClick={() =>
          setFilters((current) => ({
            ...current,
            direction: current.direction === "desc" ? "asc" : "desc",
          }))
        }
      />
      <DashboardBoard
        layout={filters.layout}
        showEmptyColumns={filters.showEmptyColumns}
        highlightMyPrs={filters.highlightMyPrs}
        visibleProperties={filters.visibleProperties}
        columns={boardColumns}
        onRetryReview={(pull) => void retryReview(pull)}
      />
      <DashboardFilterPanel open={filterOpen} filters={filters} onChange={setFilters} />
    </div>
  );
}

export { hasActiveReviewJobs } from "@/components/dashboard/dashboard-board-stream";
