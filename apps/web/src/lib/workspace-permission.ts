import type {
  EntitlementFeature,
  GlobalStatus,
  MembershipStatus,
  WorkspaceRole,
} from "@folio/types";
import { apiRequest } from "./api-client";

export interface WorkspaceContext {
  workspace: { id: string; accountLogin: string } | null;
  role: WorkspaceRole | null;
  memberStatus: MembershipStatus | null;
  globalStatus: GlobalStatus;
  isSystemAdmin: boolean;
  entitlements: EntitlementFeature[];
}

export async function getWorkspaceContext(cookie?: string): Promise<WorkspaceContext | null> {
  try {
    return await apiRequest<WorkspaceContext>("/api/v1/workspaces/current", {
      headers: cookie ? { cookie } : undefined,
    });
  } catch {
    return null;
  }
}

export function canManageMembers(ctx: WorkspaceContext | null): boolean {
  return ctx?.memberStatus === "active" && (ctx.role === "owner" || ctx.role === "admin");
}

export function canManageRoles(ctx: WorkspaceContext | null): boolean {
  return ctx?.memberStatus === "active" && ctx.role === "owner";
}

export function canSeeSystemUsers(ctx: WorkspaceContext | null): boolean {
  return ctx?.globalStatus === "active" && ctx.isSystemAdmin;
}

export function hasEntitlement(ctx: WorkspaceContext, feature: EntitlementFeature): boolean {
  return ctx.entitlements.includes(feature);
}

export function repositoryActivationReason(ctx: WorkspaceContext): string | null {
  if (ctx.memberStatus !== "active") {
    return "활성 워크스페이스 멤버만 변경할 수 있습니다.";
  }
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return "워크스페이스 관리자 권한이 필요합니다.";
  }
  if (!hasEntitlement(ctx, "repo_activation")) {
    return "현재 이용 범위에 저장소 활성화가 포함되지 않습니다.";
  }
  return null;
}
