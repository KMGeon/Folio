import type { DashboardBoardLabels } from "@/components/dashboard/dashboard-board";
import type { DashboardFilterState } from "@/components/dashboard/dashboard-filter-panel";
import type { DashboardBucket, DashboardOpenBucket } from "@/lib/dashboard-api";

export const dashboardOpenBuckets = ["ready", "yours", "other"] satisfies DashboardOpenBucket[];

export const dashboardBucketConfigs = [
  { bucket: "ready" },
  { bucket: "yours" },
  { bucket: "other" },
  { bucket: "completed" },
] satisfies { bucket: DashboardBucket }[];

export const dashboardEmptyText: Record<DashboardBucket, string> = {
  ready: "No review-ready pull requests.",
  yours: "No open pull requests authored by you.",
  other: "No other open PRs.",
  completed: "No completed Folio reviews.",
};

export const initialDashboardFilters: DashboardFilterState = {
  layout: "board",
  grouping: "responsibility",
  ordering: "updated",
  direction: "desc",
  closedRange: "1d",
  showDrafts: true,
  // Hide zero-count columns by default so an empty desk is not three dashed shells.
  showEmptyColumns: false,
  highlightMyPrs: true,
  visibleProperties: ["Repository", "ID", "Author", "Labels", "Lines changed", "Updated date"],
};

export const defaultDashboardLabels: DashboardBoardLabels = {
  ready: "Ready to review",
  yours: "Your pull requests",
  other: "Other",
  completed: "Complete",
};
