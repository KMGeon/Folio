import type { DashboardFilterState } from "@/components/dashboard/dashboard-filter-panel";
import type { DashboardOpenBucket } from "@/lib/dashboard-api";

export const dashboardOpenBuckets = ["ready", "yours", "other"] satisfies DashboardOpenBucket[];

export const initialDashboardFilters: DashboardFilterState = {
  grouping: "repository",
  ordering: "updated",
  direction: "desc",
  closedRange: "1d",
  showDrafts: true,
  visibleProperties: ["Repository", "ID", "Author", "Labels", "Lines changed", "Updated date"],
};
