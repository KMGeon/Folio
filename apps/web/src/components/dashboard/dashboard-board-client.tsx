"use client";

import { ListFilter, Search, SlidersHorizontal } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  type DashboardBucket,
  type DashboardCompletedPull,
  type DashboardOpenBucket,
  type DashboardPull,
  fetchDashboardOpenPullPages,
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

type ColumnStateMap = Record<DashboardBucket, ColumnLoadState>;

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
  completed: "No recently completed pull requests.",
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

  return (
    <div className="relative space-y-6">
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
      />
      <DashboardFilterPanel open={filterOpen} filters={filters} onChange={setFilters} />
    </div>
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
