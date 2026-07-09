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
  type DashboardBucket,
  type DashboardCompletedPull,
  type DashboardPull,
  fetchDashboardPullPage,
} from "@/lib/dashboard-api";

interface ColumnLoadState {
  items: (DashboardPull | DashboardCompletedPull)[];
  count: number;
  nextCursor: string | null;
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
}

type ColumnLoadMode = "reset" | "append";
type ColumnStateMap = Record<DashboardBucket, ColumnLoadState>;

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
  completed: "No recently completed pull requests.",
};

const initialFilters: DashboardFilterState = {
  layout: "board",
  grouping: "responsibility",
  ordering: "updated",
  direction: "desc",
  closedRange: "all",
  showDrafts: true,
  showEmptyColumns: true,
  highlightMyPrs: true,
  visibleProperties: ["Repository", "ID", "Author", "Labels", "Lines changed", "Updated date"],
};

function emptyColumn(): ColumnLoadState {
  return {
    items: [],
    count: 0,
    nextCursor: null,
    isInitialLoading: true,
    isLoadingMore: false,
    error: null,
  };
}

function initialColumns(): ColumnStateMap {
  return {
    ready: emptyColumn(),
    yours: emptyColumn(),
    other: emptyColumn(),
    completed: emptyColumn(),
  };
}

function inFlightKey(bucket: DashboardBucket, mode: ColumnLoadMode): string {
  return `${bucket}:${mode}`;
}

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
  const inFlightRef = useRef(new Set<string>());
  const observers = useRef(new Map<DashboardBucket, IntersectionObserver>());
  const requestVersionRef = useRef(0);

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const loadBucket = useCallback(
    async (bucket: DashboardBucket, mode: ColumnLoadMode, version = requestVersionRef.current) => {
      const current = columnsRef.current[bucket];
      const key = inFlightKey(bucket, mode);
      if (inFlightRef.current.has(key)) {
        return;
      }
      if (mode === "append" && (!current.nextCursor || current.isLoadingMore)) {
        return;
      }

      inFlightRef.current.add(key);
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
        if (version !== requestVersionRef.current) {
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
        if (version !== requestVersionRef.current) {
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
        inFlightRef.current.delete(key);
      }
    },
    [debouncedQuery, filters.closedRange, filters.direction, filters.ordering, filters.showDrafts],
  );

  useEffect(() => {
    const version = requestVersionRef.current + 1;
    requestVersionRef.current = version;
    inFlightRef.current.clear();
    setColumns(initialColumns());
    const activeObservers = observers.current;

    for (const { bucket } of bucketConfigs) {
      void loadBucket(bucket, "reset", version);
    }

    return () => {
      for (const observer of activeObservers.values()) {
        observer.disconnect();
      }
      activeObservers.clear();
    };
  }, [
    debouncedQuery,
    filters.closedRange,
    filters.direction,
    filters.ordering,
    filters.showDrafts,
    loadBucket,
  ]);

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
        onRetry: () => void loadBucket(bucket, "reset"),
      })),
    [columns, labels, loadBucket, sentinelRef],
  );

  return (
    <div className="relative">
      <DashboardBoard
        query={query}
        showEmptyColumns={filters.showEmptyColumns}
        columns={boardColumns}
        onQueryChange={setQuery}
        onFilterClick={() => setFilterOpen((open) => !open)}
        onSortClick={() =>
          setFilters((current) => ({
            ...current,
            direction: current.direction === "desc" ? "asc" : "desc",
          }))
        }
      />
      <DashboardFilterPanel open={filterOpen} filters={filters} onChange={setFilters} />
    </div>
  );
}
