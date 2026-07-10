import type { DashboardBucket } from "@/lib/dashboard-api";

export type DashboardLoadMode = "reset" | "append";
export type DashboardRequestTarget = DashboardBucket | "open";
export type DashboardRequestScope = "open" | "completed";
export type DashboardInFlightMap = Map<string, symbol>;
export type DashboardRequestEpochs = Record<DashboardRequestScope, number>;

const openTargets: DashboardRequestTarget[] = ["open", "ready", "yours", "other"];

export function dashboardRequestKey(
  target: DashboardRequestTarget,
  mode: DashboardLoadMode,
): string {
  return `${target}:${mode}`;
}

export function beginDashboardRequest(
  inFlight: DashboardInFlightMap,
  target: DashboardRequestTarget,
  mode: DashboardLoadMode,
): symbol | null {
  const key = dashboardRequestKey(target, mode);
  if (inFlight.has(key)) {
    return null;
  }
  const token = Symbol(key);
  inFlight.set(key, token);
  return token;
}

export function finishDashboardRequest(
  inFlight: DashboardInFlightMap,
  target: DashboardRequestTarget,
  mode: DashboardLoadMode,
  token: symbol | null,
) {
  if (!token) {
    return;
  }
  const key = dashboardRequestKey(target, mode);
  if (inFlight.get(key) === token) {
    inFlight.delete(key);
  }
}

export function resetDashboardRequestScope(
  inFlight: DashboardInFlightMap,
  epochs: DashboardRequestEpochs,
  scope: DashboardRequestScope,
): number {
  const targets = scope === "open" ? openTargets : (["completed"] as const);
  for (const target of targets) {
    inFlight.delete(dashboardRequestKey(target, "reset"));
    inFlight.delete(dashboardRequestKey(target, "append"));
  }
  epochs[scope] += 1;
  return epochs[scope];
}
