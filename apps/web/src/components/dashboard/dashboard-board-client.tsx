"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type DashboardBoardLabels,
  type DashboardColumnState,
} from "@/components/dashboard/dashboard-board";
import {
  dashboardBucketConfigs,
  dashboardEmptyText,
  dashboardOpenBuckets,
  defaultDashboardLabels,
  initialDashboardFilters,
} from "@/components/dashboard/dashboard-board-config";
import { DashboardDesk, isOpenQueueEmpty } from "@/components/dashboard/dashboard-desk";
import {
  beginDashboardRequest,
  type DashboardInFlightMap,
  type DashboardLoadMode,
  type DashboardRequestEpochs,
  finishDashboardRequest,
  resetDashboardRequestScope,
} from "@/components/dashboard/dashboard-request-scope";
import {
  columnLoadingStateForReset,
  connectDashboardBoardStream,
  hasActiveReviewJobs,
  initialColumns,
  type ColumnStateMap,
  type DashboardReloadOptions,
} from "@/components/dashboard/dashboard-board-stream";
import {
  type DashboardBucket,
  type DashboardPull,
  fetchDashboardOpenPullPages,
  fetchDashboardPullPage,
} from "@/lib/dashboard-api";
import { createReview } from "@/lib/review-api";

export function DashboardBoardClient({
  labels = defaultDashboardLabels,
  user,
}: {
  labels?: DashboardBoardLabels;
  user: { login: string; avatarUrl: string };
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filters, setFilters] = useState(initialDashboardFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columns, setColumns] = useState<ColumnStateMap>(() => initialColumns());
  const columnsRef = useRef(columns);
  const inFlightRef = useRef<DashboardInFlightMap>(new Map());
  const observers = useRef(new Map<DashboardBucket, IntersectionObserver>());
  const requestEpochsRef = useRef<DashboardRequestEpochs>({ open: 0, completed: 0 });
  const searchInputHostRef = useRef<HTMLDivElement | null>(null);

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
      options?: DashboardReloadOptions,
    ) => {
      const requestScope = bucket === "completed" ? "completed" : "open";
      const soft = options?.soft === true;
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
        [bucket]:
          mode === "reset"
            ? {
                ...prev[bucket],
                ...columnLoadingStateForReset(prev[bucket], soft),
              }
            : {
                ...prev[bucket],
                isLoadingMore: true,
                error: null,
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
    async (version = requestEpochsRef.current.open, options?: DashboardReloadOptions) => {
      const soft = options?.soft === true;
      const requestToken = beginDashboardRequest(inFlightRef.current, "open", "reset");
      if (!requestToken) {
        return;
      }

      setColumns((prev) => {
        const next = { ...prev };
        for (const bucket of dashboardOpenBuckets) {
          next[bucket] = {
            ...prev[bucket],
            ...columnLoadingStateForReset(prev[bucket], soft),
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
          for (const bucket of dashboardOpenBuckets) {
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
          for (const bucket of dashboardOpenBuckets) {
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
      for (const bucket of dashboardOpenBuckets) {
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
      // Quiet poll while review jobs run — keep cards visible.
      void loadOpenBuckets(openEpoch, { soft: true });
      void loadBucket("completed", "reset", completedEpoch, { soft: true });
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
      dashboardBucketConfigs.map(({ bucket }) => ({
        bucket,
        title: labels[bucket],
        count: columns[bucket].count,
        items: columns[bucket].items,
        isInitialLoading: columns[bucket].isInitialLoading,
        isLoadingMore: columns[bucket].isLoadingMore,
        hasMore: Boolean(columns[bucket].nextCursor),
        error: columns[bucket].error,
        emptyText: dashboardEmptyText[bucket],
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

  const headerCounts = useMemo(
    () => ({
      ready: columns.ready.count,
      yours: columns.yours.count,
      completed: columns.completed.count,
    }),
    [columns.completed.count, columns.ready.count, columns.yours.count],
  );

  const openQueueEmpty = useMemo(
    () =>
      isOpenQueueEmpty({
        ready: columns.ready,
        yours: columns.yours,
        other: columns.other,
      }),
    [columns.other, columns.ready, columns.yours],
  );

  const focusSearch = useCallback(() => {
    searchInputHostRef.current?.querySelector("input")?.focus();
  }, []);

  const showComplete = useCallback(() => {
    if (columns.completed.count > 0) {
      document
        .getElementById("dashboard-complete-column")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setFilters((current) => ({ ...current, showEmptyColumns: true }));
  }, [columns.completed.count]);

  const completedOnlyColumns = useMemo(
    () => boardColumns.filter((column) => column.bucket === "completed"),
    [boardColumns],
  );

  return (
    <DashboardDesk
      user={user}
      counts={headerCounts}
      openQueueEmpty={openQueueEmpty}
      query={query}
      onQueryChange={setQuery}
      onFilterClick={() => setFilterOpen((open) => !open)}
      onSortClick={() =>
        setFilters((current) => ({
          ...current,
          direction: current.direction === "desc" ? "asc" : "desc",
        }))
      }
      searchHostRef={searchInputHostRef}
      filterOpen={filterOpen}
      filters={filters}
      onFiltersChange={setFilters}
      boardColumns={boardColumns}
      completedColumns={completedOnlyColumns}
      onRetryReview={(pull) => void retryReview(pull)}
      onSearchClick={focusSearch}
      onShowComplete={showComplete}
    />
  );
}
