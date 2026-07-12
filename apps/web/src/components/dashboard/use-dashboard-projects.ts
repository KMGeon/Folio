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
import {
  fetchDashboardSummary,
  type DashboardRepo,
  type DashboardPull,
  type DashboardCompletedPull,
} from "@/lib/dashboard-api";

/** Settings-enabled repositories only, sorted for stable sidebar order. */
export function selectEnabledDashboardRepos(repos: DashboardRepo[]): DashboardRepo[] {
  const priorityRank: Record<DashboardRepo["priority"], number> = {
    high: 0,
    normal: 1,
    low: 2,
  };
  return [...repos]
    .filter((repo) => repo.folioEnabled)
    .sort(
      (left, right) =>
        priorityRank[left.priority] - priorityRank[right.priority] ||
        left.fullName.localeCompare(right.fullName),
    );
}

export function appendDashboardProjectPullPage<T extends DashboardPull | DashboardCompletedPull>(
  existing: T[],
  incoming: T[],
): T[] {
  const seen = new Set(existing.map((pull) => pull.id));
  return [...existing, ...incoming.filter((pull) => !seen.has(pull.id))];
}

export function useDashboardProjects(options: DashboardProjectLoadOptions) {
  const { q, ordering, direction, closedRange, showDrafts } = options;
  const [repos, setRepos] = useState<DashboardRepo[]>([]);
  const [projects, setProjects] = useState<DashboardProjectData[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [completedLoadingMore, setCompletedLoadingMore] = useState<Record<string, boolean>>({});
  const loadVersion = useRef(0);
  const completedLoadsInFlight = useRef(new Set<string>());
  const projectsRef = useRef(projects);

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

  const reload = useCallback(() => setRefreshVersion((version) => version + 1), []);
  const loadMoreCompleted = useCallback(
    async (repoId: string) => {
      if (completedLoadsInFlight.current.has(repoId)) {
        return;
      }
      const project = projectsRef.current.find((candidate) => candidate.repo.id === repoId);
      const cursor = project?.pages.completed.nextCursor;
      if (!project || !cursor) {
        return;
      }

      const version = loadVersion.current;
      completedLoadsInFlight.current.add(repoId);
      setCompletedLoadingMore((current) => ({ ...current, [repoId]: true }));
      try {
        const page = await loadDashboardProjectBucketPage(project.repo, "completed", cursor, {
          q,
          ordering,
          direction,
          closedRange,
          showDrafts,
        });
        if (version !== loadVersion.current) {
          return;
        }
        setProjects((current) =>
          current.map((candidate) =>
            candidate.repo.id === repoId
              ? {
                  ...candidate,
                  pages: {
                    ...candidate.pages,
                    completed: {
                      ...page,
                      items: appendDashboardProjectPullPage(
                        candidate.pages.completed.items,
                        page.items,
                      ),
                    },
                  },
                }
              : candidate,
          ),
        );
      } catch {
        // Keep already loaded history visible so a transient page failure is safe to retry on scroll.
      } finally {
        completedLoadsInFlight.current.delete(repoId);
        setCompletedLoadingMore((current) => ({ ...current, [repoId]: false }));
      }
    },
    [closedRange, direction, ordering, q, showDrafts],
  );

  return {
    projects,
    isSummaryLoading,
    summaryError,
    completedLoadingMore,
    loadMoreCompleted,
    reload,
  };
}
