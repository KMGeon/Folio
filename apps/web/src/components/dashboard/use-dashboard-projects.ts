"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  emptyDashboardProjectData,
  type DashboardProjectData,
} from "@/components/dashboard/dashboard-project-desk-model";
import {
  type DashboardProjectLoadOptions,
  loadDashboardProjectBucketPage,
  loadDashboardProjectData,
} from "@/components/dashboard/dashboard-project-loader";
import { fetchDashboardSummary, type DashboardRepo } from "@/lib/dashboard-api";

/** Settings-enabled repositories only, sorted for stable sidebar order. */
export function selectEnabledDashboardRepos(repos: DashboardRepo[]): DashboardRepo[] {
  return [...repos]
    .filter((repo) => repo.folioEnabled)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function useDashboardProjects(options: DashboardProjectLoadOptions) {
  const { q, ordering, direction, closedRange, showDrafts } = options;
  const [repos, setRepos] = useState<DashboardRepo[]>([]);
  const [projects, setProjects] = useState<DashboardProjectData[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  /** repoId → loading-more for completed history */
  const [completedLoadingMore, setCompletedLoadingMore] = useState<Record<string, boolean>>({});
  const loadVersion = useRef(0);
  const projectsRef = useRef(projects);
  const completedInFlight = useRef(new Set<string>());

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    let active = true;
    void fetchDashboardSummary()
      .then((summary) => {
        if (!active) {
          return;
        }
        // Never list every GitHub install — only Folio-enabled repos from Settings.
        const sorted = selectEnabledDashboardRepos(summary.repos);
        setRepos(sorted);
        setProjects(sorted.map((repo) => emptyDashboardProjectData(repo)));
        setSummaryError(null);
      })
      .catch(() => {
        if (active) {
          setSummaryError("Projects could not be loaded.");
        }
      })
      .finally(() => {
        if (active) {
          setIsSummaryLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (repos.length === 0) {
      return;
    }
    const version = ++loadVersion.current;
    const previous = new Map(projectsRef.current.map((project) => [project.repo.id, project]));
    setProjects(
      repos.map((repo) => ({
        ...(previous.get(repo.id) ?? emptyDashboardProjectData(repo)),
        repo,
        isLoading: true,
        error: null,
      })),
    );
    setCompletedLoadingMore({});
    completedInFlight.current.clear();

    void Promise.all(
      repos.map(async (repo) => {
        try {
          return await loadDashboardProjectData(repo, {
            q,
            ordering,
            direction,
            closedRange,
            showDrafts,
          });
        } catch {
          const existing = previous.get(repo.id) ?? emptyDashboardProjectData(repo, false);
          return {
            ...existing,
            repo,
            isLoading: false,
            error: "Pull requests could not be loaded.",
          };
        }
      }),
    ).then((loaded) => {
      if (version === loadVersion.current) {
        setProjects(loaded);
      }
    });
  }, [closedRange, direction, ordering, q, showDrafts, refreshVersion, repos]);

  const loadMoreCompleted = useCallback(
    async (repoId: string) => {
      const project = projectsRef.current.find((candidate) => candidate.repo.id === repoId);
      const cursor = project?.pages.completed.nextCursor;
      if (!project || !cursor || completedInFlight.current.has(repoId)) {
        return;
      }
      completedInFlight.current.add(repoId);
      setCompletedLoadingMore((current) => ({ ...current, [repoId]: true }));
      try {
        const page = await loadDashboardProjectBucketPage(project.repo, {
          q,
          ordering,
          direction,
          closedRange,
          showDrafts,
          bucket: "completed",
          cursor,
        });
        setProjects((current) =>
          current.map((candidate) => {
            if (candidate.repo.id !== repoId) {
              return candidate;
            }
            const seen = new Set(candidate.pages.completed.items.map((item) => item.id));
            const appended = page.items.filter((item) => !seen.has(item.id));
            return {
              ...candidate,
              pages: {
                ...candidate.pages,
                completed: {
                  items: [...candidate.pages.completed.items, ...appended],
                  count: page.count,
                  nextCursor: page.nextCursor,
                },
              },
            };
          }),
        );
      } finally {
        completedInFlight.current.delete(repoId);
        setCompletedLoadingMore((current) => ({ ...current, [repoId]: false }));
      }
    },
    [closedRange, direction, ordering, q, showDrafts],
  );

  const reload = useCallback(() => setRefreshVersion((version) => version + 1), []);
  return {
    projects,
    isSummaryLoading,
    summaryError,
    reload,
    loadMoreCompleted,
    completedLoadingMore,
  };
}
