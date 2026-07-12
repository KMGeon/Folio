"use client";

import type { Ref } from "react";

import {
  type DashboardProjectData,
  type DashboardQueueFocus,
  type DashboardScopeCounts,
} from "@/components/dashboard/dashboard-project-desk-model";
import { DashboardProjectBar } from "@/components/dashboard/dashboard-project-bar";
import { DashboardProjectSidebar } from "@/components/dashboard/dashboard-project-sidebar";
import { DashboardProjectView } from "@/components/dashboard/dashboard-project-view";
import {
  DashboardFilterPanel,
  type DashboardFilterState,
} from "@/components/dashboard/dashboard-filter-panel";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSearchBar } from "@/components/dashboard/dashboard-search-bar";
import { DashboardColumnSkeleton } from "@/components/dashboard/dashboard-skeleton";
import type { DashboardPull } from "@/lib/dashboard-api";

export function DashboardDesk({
  user,
  counts,
  scopeName,
  projects,
  activeRepoId,
  queueFocus,
  onProjectSelect,
  onQueueFocusChange,
  projectsLoading,
  projectsError,
  query,
  onQueryChange,
  onFilterClick,
  onSortClick,
  searchHostRef,
  filterOpen,
  filters,
  onFiltersChange,
  onRetryReview,
  completedLoadingMore,
  onLoadMoreCompleted,
}: {
  user: { login: string; avatarUrl: string };
  counts: DashboardScopeCounts;
  scopeName: string;
  projects: DashboardProjectData[];
  activeRepoId: string | null;
  queueFocus: DashboardQueueFocus;
  onProjectSelect: (repoId: string | null) => void;
  onQueueFocusChange: (focus: DashboardQueueFocus) => void;
  projectsLoading: boolean;
  projectsError: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onFilterClick: () => void;
  onSortClick: () => void;
  searchHostRef: Ref<HTMLDivElement>;
  filterOpen: boolean;
  filters: DashboardFilterState;
  onFiltersChange: (filters: DashboardFilterState) => void;
  onRetryReview: (pull: DashboardPull) => void;
  completedLoadingMore: Record<string, boolean>;
  onLoadMoreCompleted: (repoId: string) => void;
}) {
  const activeProject = activeRepoId
    ? projects.find((project) => project.repo.id === activeRepoId)
    : null;
  const activeRepo = activeProject?.repo ?? null;

  return (
    <div className="relative space-y-5">
      <DashboardHeader
        login={user.login}
        avatarUrl={user.avatarUrl}
        counts={counts}
        scopeName={scopeName}
      />
      <div className="grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <DashboardProjectSidebar
          projects={projects}
          activeRepoId={activeRepoId}
          onSelect={onProjectSelect}
        />
        <main className="min-w-0 space-y-4">
          <DashboardProjectBar
            activeRepo={activeRepo}
            repoCount={projects.length}
            counts={counts}
            focus={queueFocus}
            onFocusChange={onQueueFocusChange}
          />
          <div ref={searchHostRef}>
            <DashboardSearchBar
              query={query}
              onQueryChange={onQueryChange}
              onFilterClick={onFilterClick}
              onSortClick={onSortClick}
              placeholder={`Search in ${scopeName}...`}
            />
          </div>
          {projectsError ? (
            <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              {projectsError}
            </div>
          ) : projectsLoading && projects.length === 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              <DashboardColumnSkeleton />
            </div>
          ) : (
            <DashboardProjectView
              projects={projects}
              activeRepoId={activeRepoId}
              focus={queueFocus}
              onFocusChange={onQueueFocusChange}
              visibleProperties={filters.visibleProperties}
              onRetryReview={onRetryReview}
              completedLoadingMore={completedLoadingMore}
              onLoadMoreCompleted={onLoadMoreCompleted}
            />
          )}
        </main>
      </div>
      <DashboardFilterPanel open={filterOpen} filters={filters} onChange={onFiltersChange} />
    </div>
  );
}

export function isOpenQueueEmpty(
  columns: Record<"ready" | "yours" | "other", { count: number; isInitialLoading: boolean }>,
): boolean {
  const buckets = ["ready", "yours", "other"] as const;
  if (buckets.some((bucket) => columns[bucket].isInitialLoading)) {
    return false;
  }
  return buckets.every((bucket) => columns[bucket].count === 0);
}
