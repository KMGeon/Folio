import { enumFromConst } from "./common.js";

export const WORKSPACE_ROLE = {
  OWNER: "owner",
  ADMIN: "admin",
  REVIEWER: "reviewer",
} as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLE)[keyof typeof WORKSPACE_ROLE];
export const WorkspaceRoleSchema = enumFromConst(WORKSPACE_ROLE);

export const MEMBERSHIP_STATUS = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
} as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[keyof typeof MEMBERSHIP_STATUS];
export const MembershipStatusSchema = enumFromConst(MEMBERSHIP_STATUS);

export const INSTALLATION_ONBOARDING_STATE = {
  READY: "ready",
  INSTALL_REQUIRED: "install_required",
  REINSTALL_REQUIRED: "reinstall_required",
  MEMBERSHIP_SUSPENDED: "membership_suspended",
} as const;
export type InstallationOnboardingState =
  (typeof INSTALLATION_ONBOARDING_STATE)[keyof typeof INSTALLATION_ONBOARDING_STATE];
export const InstallationOnboardingStateSchema = enumFromConst(INSTALLATION_ONBOARDING_STATE);

export const GLOBAL_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
} as const;
export type GlobalStatus = (typeof GLOBAL_STATUS)[keyof typeof GLOBAL_STATUS];
export const GlobalStatusSchema = enumFromConst(GLOBAL_STATUS);

// Only the state changes Decision 14 requires to be audited.
export const AUDIT_ACTION = {
  USER_APPROVE: "user_approve",
  USER_SUSPEND: "user_suspend",
  MEMBER_SUSPEND: "member_suspend",
  MEMBER_RESTORE: "member_restore",
  ROLE_CHANGE: "role_change",
  OWNER_TRANSFER: "owner_transfer",
  SYSTEM_ADMIN_TRANSFER: "system_admin_transfer",
  WORKSPACE_CLAIM: "workspace_claim",
  REPO_ACTIVATION_CHANGE: "repo_activation_change",
  REPO_SETTINGS_CHANGE: "repo_settings_change",
} as const;
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
export const AuditActionSchema = enumFromConst(AUDIT_ACTION);

// USER-scoped product capabilities gated by a future subscription (Decision 12).
export const ENTITLEMENT_FEATURE = {
  REPO_ACTIVATION: "repo_activation",
  PR_ANALYSIS: "pr_analysis",
  REVIEW_READ: "review_read",
  REVIEW_STATE_MUTATION: "review_state_mutation",
  COMMENT: "comment",
} as const;
export type EntitlementFeature = (typeof ENTITLEMENT_FEATURE)[keyof typeof ENTITLEMENT_FEATURE];
export const EntitlementFeatureSchema = enumFromConst(ENTITLEMENT_FEATURE);
