import { GLOBAL_STATUS, MEMBERSHIP_STATUS, WORKSPACE_ROLE, type WorkspaceRole } from "@folio/types";
import {
  type ActorGlobalContext,
  type MemberOperation,
  type PolicyDecision,
  type WorkspaceMembership,
  allow,
  deny,
  roleRank,
} from "./workspace-role.model.js";

// Folio role axis. system_admin is intentionally NOT consulted here: it never
// grants workspace management or repo-data access (Decision 5).
export function canAccessWorkspace(
  actor: ActorGlobalContext,
  membership: WorkspaceMembership,
  requiredRole: WorkspaceRole,
): PolicyDecision {
  if (actor.globalStatus !== GLOBAL_STATUS.ACTIVE) {
    return deny("global status is not active");
  }
  if (membership.status !== MEMBERSHIP_STATUS.ACTIVE) {
    return deny("workspace membership is suspended");
  }
  if (roleRank(membership.role) < roleRank(requiredRole)) {
    return deny(`requires ${requiredRole}`);
  }
  return allow;
}

const OWNER_ONLY: ReadonlySet<MemberOperation> = new Set(["elevate", "demote"]);

// Decision 9: admin may suspend/restore/remove reviewers only; role changes are owner-only.
export function canManageMember(
  actorMembership: WorkspaceMembership,
  targetMembership: WorkspaceMembership,
  operation: MemberOperation,
): PolicyDecision {
  if (actorMembership.status !== MEMBERSHIP_STATUS.ACTIVE) {
    return deny("actor membership is suspended");
  }
  if (OWNER_ONLY.has(operation)) {
    return actorMembership.role === WORKSPACE_ROLE.OWNER
      ? allow
      : deny("only the owner may change roles");
  }
  // suspend / restore / remove
  if (
    actorMembership.role !== WORKSPACE_ROLE.OWNER &&
    actorMembership.role !== WORKSPACE_ROLE.ADMIN
  ) {
    return deny("only owner or admin may manage members");
  }
  if (
    actorMembership.role === WORKSPACE_ROLE.ADMIN &&
    targetMembership.role !== WORKSPACE_ROLE.REVIEWER
  ) {
    return deny("admins may only manage reviewers");
  }
  return allow;
}

export function canTransferOwnership(actorMembership: WorkspaceMembership): PolicyDecision {
  return actorMembership.role === WORKSPACE_ROLE.OWNER &&
    actorMembership.status === MEMBERSHIP_STATUS.ACTIVE
    ? allow
    : deny("only the owner may transfer ownership");
}
