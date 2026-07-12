"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  dashboardOpenBuckets,
  initialDashboardFilters,
} from "@/components/dashboard/dashboard-board-config";
import { DashboardDesk } from "@/components/dashboard/dashboard-desk";
import {
  dashboardDefaultFocus,
  dashboardScopeCounts,
  dashboardScopeName,
  type DashboardQueueFocus,
} from "@/components/dashboard/dashboard-project-desk-model";
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
import { useDashboardProjects } from "@/components/dashboard/use-dashboard-projects";
import {
  type DashboardBucket,
  type DashboardPull,
  fetchDashboardOpenPullPages,
  fetchDashboardPullPage,
} from "@/lib/dashboard-api";
import { createReview } from "@/lib/review-api";

export function DashboardBoardClient({ user }: { user: { login: string; avatarUrl: string } }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filters, setFilters] = useState(initialDashboardFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [queueFocus, setQueueFocus] = useState<DashboardQueueFocus>("complete");
  const [focusIsUserSelected, setFocusIsUserSelected] = useState(false);
  const [columns, setColumns] = useState<ColumnStateMap>(() => initialColumns());
  const columnsRef = useRef(columns);
  const inFlightRef = useRef<DashboardInFlightMap>(new Map());
  const requestEpochsRef = useRef<DashboardRequestEpochs>({ open: 0, completed: 0 });
  const searchInputHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const {
    projects,
    isSummaryLoading,
    summaryError,
    reload: reloadProjects,
  } = useDashboardProjects({
    q: debouncedQuery || undefined,
    ordering: filters.ordering,
    direction: filters.direction,
    closedRange: filters.closedRange,
    showDrafts: filters.showDrafts,
  });
  const activeProject = useMemo(
    () => projects.find((project) => project.repo.id === activeRepoId) ?? null,
    [activeRepoId, projects],
  );
  const activeRepository = activeProject?.repo.fullName;

  useEffect(() => {
    if (activeRepoId && projects.length > 0 && !activeProject) {
      setActiveRepoId(null);
    }
  }, [activeProject, activeRepoId, projects.length]);

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
          repository: activeRepository,
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
    [
      activeRepository,
      debouncedQuery,
      filters.closedRange,
      filters.direction,
      filters.ordering,
      filters.showDrafts,
    ],
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
          repository: activeRepository,
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
    [activeRepository, debouncedQuery, filters.direction, filters.ordering, filters.showDrafts],
  );

  useEffect(() => {
    const openEpoch = resetDashboardRequestScope(
      inFlightRef.current,
      requestEpochsRef.current,
      "open",
    );

    void loadOpenBuckets(openEpoch);

    return undefined;
  }, [debouncedQuery, filters.direction, filters.ordering, filters.showDrafts, loadOpenBuckets]);

  useEffect(() => {
    return connectDashboardBoardStream({
      inFlightRef,
      requestEpochsRef,
      loadOpenBuckets,
      setColumns,
      onRefresh: reloadProjects,
    });
  }, [loadOpenBuckets, reloadProjects]);

  useEffect(() => {
    const completedEpoch = resetDashboardRequestScope(
      inFlightRef.current,
      requestEpochsRef.current,
      "completed",
    );

    void loadBucket("completed", "reset", completedEpoch);

    return undefined;
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
      reloadProjects();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [hasActiveReviews, loadBucket, loadOpenBuckets, reloadProjects]);

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
      reloadProjects();
    },
    [loadBucket, loadOpenBuckets, reloadProjects],
  );

  const headerCounts = useMemo(
    () =>
      projects.length > 0
        ? dashboardScopeCounts(projects, activeRepoId)
        : {
            attention: 0,
            ready: columns.ready.count,
            reviewing: columns.yours.count,
            processing: columns.other.count,
            complete: columns.completed.count,
          },
    [
      activeRepoId,
      columns.completed.count,
      columns.other.count,
      columns.ready.count,
      columns.yours.count,
      projects,
    ],
  );
  const scopeName = dashboardScopeName(activeProject?.repo ?? null);
  const projectsLoading = isSummaryLoading || projects.some((project) => project.isLoading);

  useEffect(() => {
    if (!focusIsUserSelected) {
      setQueueFocus(dashboardDefaultFocus(headerCounts));
    }
  }, [focusIsUserSelected, headerCounts]);

  const selectProject = useCallback((repoId: string | null) => {
    setActiveRepoId(repoId);
    setFocusIsUserSelected(false);
  }, []);

  const selectQueueFocus = useCallback((focus: DashboardQueueFocus) => {
    setQueueFocus(focus);
    setFocusIsUserSelected(true);
  }, []);

  return (
    <DashboardDesk
      user={user}
      counts={headerCounts}
      scopeName={scopeName}
      projects={projects}
      activeRepoId={activeRepoId}
      queueFocus={queueFocus}
      onProjectSelect={selectProject}
      onQueueFocusChange={selectQueueFocus}
      projectsLoading={projectsLoading}
      projectsError={summaryError}
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
      onRetryReview={(pull) => void retryReview(pull)}
    />
  );
}
