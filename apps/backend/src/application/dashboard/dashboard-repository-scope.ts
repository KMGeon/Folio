import type { DashboardWorkspaceScope } from "./dashboard-workspace-scope.js";

/** Keep project selection exact so similarly named repositories never leak into scoped counts. */
export function dashboardScopeForRepository(
  scope: DashboardWorkspaceScope | null,
  repository: string | undefined,
): DashboardWorkspaceScope | null {
  const normalized = repository?.trim().toLowerCase();
  if (!scope || !normalized) {
    return scope;
  }
  return {
    ...scope,
    repositories: scope.repositories.filter(
      (candidate) => candidate.fullName.toLowerCase() === normalized,
    ),
  };
}
