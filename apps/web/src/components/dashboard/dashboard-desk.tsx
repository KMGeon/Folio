"use client";

import type { ReactNode, Ref } from "react";

import { DashboardBoard, type DashboardColumnState } from "@/components/dashboard/dashboard-board";
import { DashboardFocusEmpty } from "@/components/dashboard/dashboard-focus-empty";
import {
  DashboardFilterPanel,
  type DashboardFilterState,
} from "@/components/dashboard/dashboard-filter-panel";
import {
  DashboardHeader,
  type DashboardHeaderCounts,
} from "@/components/dashboard/dashboard-header";
import { DashboardSearchBar } from "@/components/dashboard/dashboard-search-bar";
import type { DashboardCardProperty, DashboardPull } from "@/lib/dashboard-api";

export function DashboardDesk({
  user,
  counts,
  openQueueEmpty,
  query,
  onQueryChange,
  onFilterClick,
  onSortClick,
  searchHostRef,
  filterOpen,
  filters,
  onFiltersChange,
  boardColumns,
  completedColumns,
  onRetryReview,
  onSearchClick,
  onShowComplete,
}: {
  user: { login: string; avatarUrl: string };
  counts: DashboardHeaderCounts;
  openQueueEmpty: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onFilterClick: () => void;
  onSortClick: () => void;
  searchHostRef: Ref<HTMLDivElement>;
  filterOpen: boolean;
  filters: DashboardFilterState;
  onFiltersChange: (filters: DashboardFilterState) => void;
  boardColumns: DashboardColumnState[];
  completedColumns: DashboardColumnState[];
  onRetryReview: (pull: DashboardPull) => void;
  onSearchClick: () => void;
  onShowComplete: () => void;
}) {
  return (
    <div className="relative space-y-5">
      <DashboardHeader login={user.login} avatarUrl={user.avatarUrl} counts={counts} />
      <div ref={searchHostRef}>
        <DashboardSearchBar
          query={query}
          onQueryChange={onQueryChange}
          onFilterClick={onFilterClick}
          onSortClick={onSortClick}
        />
      </div>
      {openQueueEmpty ? (
        <FocusQueueLayout
          completedColumns={completedColumns}
          highlightMyPrs={filters.highlightMyPrs}
          visibleProperties={filters.visibleProperties}
          onRetryReview={onRetryReview}
          onSearchClick={onSearchClick}
          onShowComplete={onShowComplete}
        />
      ) : (
        <DashboardBoard
          layout={filters.layout}
          showEmptyColumns={filters.showEmptyColumns}
          highlightMyPrs={filters.highlightMyPrs}
          visibleProperties={filters.visibleProperties}
          columns={boardColumns}
          onRetryReview={onRetryReview}
        />
      )}
      <DashboardFilterPanel open={filterOpen} filters={filters} onChange={onFiltersChange} />
    </div>
  );
}

function FocusQueueLayout({
  completedColumns,
  highlightMyPrs,
  visibleProperties,
  onRetryReview,
  onSearchClick,
  onShowComplete,
}: {
  completedColumns: DashboardColumnState[];
  highlightMyPrs: boolean;
  visibleProperties: DashboardCardProperty[];
  onRetryReview: (pull: DashboardPull) => void;
  onSearchClick: () => void;
  onShowComplete: () => void;
}): ReactNode {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <DashboardFocusEmpty onSearchClick={onSearchClick} onShowComplete={onShowComplete} />
      <div id="dashboard-complete-column">
        <DashboardBoard
          layout="list"
          showEmptyColumns
          highlightMyPrs={highlightMyPrs}
          visibleProperties={visibleProperties}
          columns={completedColumns}
          onRetryReview={onRetryReview}
        />
      </div>
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
