import { webEnv } from "./env";

export interface WorkspaceContext {
  workspace: { id: string; accountLogin: string } | null;
  role: "owner" | "admin" | "reviewer" | null;
  memberStatus: "active" | "suspended" | null;
  globalStatus: "pending" | "active" | "suspended";
  isSystemAdmin: boolean;
  entitlements: string[];
}

export async function getWorkspaceContext(cookie?: string): Promise<WorkspaceContext | null> {
  const res = await fetch(new URL("/api/v1/workspaces/current", webEnv.apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
  });
  if (!res.ok) {
    return null;
  }
  const payload = (await res.json()) as { success: boolean; data?: WorkspaceContext };
  return payload.success && payload.data ? payload.data : null;
}

export function canManageMembers(ctx: WorkspaceContext): boolean {
  return ctx.role === "owner" || ctx.role === "admin";
}

export function canManageRoles(ctx: WorkspaceContext): boolean {
  return ctx.role === "owner";
}

export function canSeeSystemUsers(ctx: WorkspaceContext): boolean {
  return ctx.isSystemAdmin;
}

export function hasEntitlement(ctx: WorkspaceContext, feature: string): boolean {
  return ctx.entitlements.includes(feature);
}
