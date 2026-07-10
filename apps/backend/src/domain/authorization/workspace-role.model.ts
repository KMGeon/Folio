import {
  WORKSPACE_ROLE,
  type GlobalStatus,
  type MembershipStatus,
  type WorkspaceRole,
} from "@folio/types";

export interface ActorGlobalContext {
  globalStatus: GlobalStatus;
  isSystemAdmin: boolean;
}

export interface WorkspaceMembership {
  role: WorkspaceRole;
  status: MembershipStatus;
}

export type MemberOperation = "suspend" | "restore" | "remove" | "elevate" | "demote";

export type PolicyDecision = { allow: true } | { allow: false; reason: string };

const RANK: Record<WorkspaceRole, number> = {
  [WORKSPACE_ROLE.REVIEWER]: 1,
  [WORKSPACE_ROLE.ADMIN]: 2,
  [WORKSPACE_ROLE.OWNER]: 3,
};

export function roleRank(role: WorkspaceRole): number {
  return RANK[role];
}

export const allow: PolicyDecision = { allow: true };
export function deny(reason: string): PolicyDecision {
  return { allow: false, reason };
}
