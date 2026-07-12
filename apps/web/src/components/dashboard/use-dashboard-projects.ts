"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  emptyDashboardProjectData,
  type DashboardProjectData,
} from "@/components/dashboard/dashboard-project-desk-model";
import {
  type DashboardProjectLoadOptions,
  loadDashboardProjectData,
} from "@/components/dashboard/dashboard-project-loader";
import { fetchDashboardSummary, type DashboardRepo } from "@/lib/dashboard-api";

export function useDashboardProjects(options: DashboardProjectLoadOptions) {
  const { q, ordering, direction, closedRange, showDrafts } = options;
  const [repos, setRepos] = useState<DashboardRepo[]>([]);
  const [projects, setProjects] = useState<DashboardProjectData[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const loadVersion = useRef(0);
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
        const sorted = [...summary.repos].sort((a, b) => a.fullName.localeCompare(b.fullName));
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
  return { projects, isSummaryLoading, summaryError, reload };
}
