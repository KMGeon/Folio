import { z } from "zod";
import {
  AuditActionSchema,
  GlobalStatusSchema,
  MembershipStatusSchema,
  WorkspaceRoleSchema,
} from "./authorization.js";
import { IsoDateTimeSchema } from "./common.js";
import { JOB_KIND, JOB_STATUS } from "./job.js";

export const AdminUserStatusFilterSchema = z.enum(["all", "pending", "active", "suspended"]);
export type AdminUserStatusFilter = z.infer<typeof AdminUserStatusFilterSchema>;

export const AdminUserItemSchema = z
  .object({
    id: z.string().uuid(),
    login: z.string().min(1),
    avatarUrl: z.string().min(1),
    email: z.string().email().nullable(),
    globalStatus: GlobalStatusSchema,
    isSystemAdmin: z.boolean(),
    createdAt: IsoDateTimeSchema,
  })
  .strict();
export type AdminUserItem = z.infer<typeof AdminUserItemSchema>;

export const AdminUserPageSchema = z
  .object({
    items: z.array(AdminUserItemSchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();
export type AdminUserPage = z.infer<typeof AdminUserPageSchema>;

const AdminIdentitySchema = z
  .object({
    id: z.string().uuid(),
    login: z.string().min(1),
    avatarUrl: z.string().min(1),
  })
  .strict();

export const AdminAuditTargetTypeSchema = z.enum(["user", "workspace_member", "repository"]);

export const AdminAuditSnapshotSchema = z
  .object({
    globalStatus: GlobalStatusSchema.nullable().optional(),
    status: MembershipStatusSchema.nullable().optional(),
    role: WorkspaceRoleSchema.nullable().optional(),
    owner: z.string().uuid().optional(),
    systemAdminUserId: z.string().uuid().optional(),
    folioEnabled: z.boolean().optional(),
  })
  .strict();

export const AdminAuditItemSchema = z
  .object({
    id: z.string().uuid(),
    action: AuditActionSchema,
    actor: AdminIdentitySchema,
    target: z
      .object({
        type: AdminAuditTargetTypeSchema,
        id: z.string().uuid(),
        label: z.string().min(1),
      })
      .strict(),
    workspace: z
      .object({ id: z.string().uuid(), accountLogin: z.string().min(1) })
      .strict()
      .nullable(),
    before: AdminAuditSnapshotSchema,
    after: AdminAuditSnapshotSchema,
    createdAt: IsoDateTimeSchema,
  })
  .strict();
export type AdminAuditItem = z.infer<typeof AdminAuditItemSchema>;

export const AdminAuditPageSchema = z
  .object({
    items: z.array(AdminAuditItemSchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();
export type AdminAuditPage = z.infer<typeof AdminAuditPageSchema>;

export const AdminWorkspaceInstallationStateSchema = z.enum([
  "none",
  "active",
  "suspended",
  "mixed",
]);
export type AdminWorkspaceInstallationState = z.infer<typeof AdminWorkspaceInstallationStateSchema>;

const AdminWorkspaceOwnerSchema = AdminIdentitySchema.nullable();

export const AdminWorkspaceItemSchema = z
  .object({
    id: z.string().uuid(),
    accountLogin: z.string().min(1),
    accountType: z.enum(["User", "Organization"]),
    createdAt: IsoDateTimeSchema,
    owner: AdminWorkspaceOwnerSchema,
    memberCount: z.number().int().nonnegative(),
    repositoryCount: z.number().int().nonnegative(),
    enabledRepositoryCount: z.number().int().nonnegative(),
    installationState: AdminWorkspaceInstallationStateSchema,
    recentActivityAt: IsoDateTimeSchema.nullable(),
  })
  .strict();
export type AdminWorkspaceItem = z.infer<typeof AdminWorkspaceItemSchema>;

export const AdminWorkspacePageSchema = z
  .object({
    items: z.array(AdminWorkspaceItemSchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();
export type AdminWorkspacePage = z.infer<typeof AdminWorkspacePageSchema>;

const AdminWorkspaceMemberSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    login: z.string().min(1),
    avatarUrl: z.string().min(1),
    role: WorkspaceRoleSchema,
    status: MembershipStatusSchema,
    joinedAt: IsoDateTimeSchema,
  })
  .strict();

const AdminWorkspaceRepositorySchema = z
  .object({
    id: z.string().uuid(),
    fullName: z.string().min(1),
    private: z.boolean(),
    folioEnabled: z.boolean(),
  })
  .strict();

const AdminWorkspaceInstallationSchema = z
  .object({
    id: z.string().uuid(),
    githubInstallationId: z.number().int(),
    accountLogin: z.string().min(1),
    accountType: z.enum(["User", "Organization"]),
    suspendedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export const AdminWorkspaceDetailSchema = AdminWorkspaceItemSchema.extend({
  members: z.array(AdminWorkspaceMemberSchema),
  repositories: z.array(AdminWorkspaceRepositorySchema),
  installations: z.array(AdminWorkspaceInstallationSchema),
  recentAudit: z.array(AdminAuditItemSchema).max(10),
}).strict();
export type AdminWorkspaceDetail = z.infer<typeof AdminWorkspaceDetailSchema>;

export const AdminJobKindSchema = z.enum([
  JOB_KIND.DECOMPOSE,
  JOB_KIND.RE_CHAPTER,
  JOB_KIND.SYNC_COMMENTS,
  JOB_KIND.REVIEW_PULL,
  JOB_KIND.PR_INDEX_BACKFILL,
]);
export type AdminJobKind = z.infer<typeof AdminJobKindSchema>;

export const AdminJobStatusSchema = z.enum([
  JOB_STATUS.PENDING,
  JOB_STATUS.CLAIMED,
  JOB_STATUS.RUNNING,
  JOB_STATUS.SUCCEEDED,
  JOB_STATUS.FAILED,
  JOB_STATUS.DEAD,
]);
export type AdminJobStatus = z.infer<typeof AdminJobStatusSchema>;

const AdminJobRepositorySchema = z
  .object({
    id: z.string().uuid().nullable(),
    fullName: z.string().min(1),
  })
  .strict()
  .nullable();

// Safe queue projection only — never payload, result, dedupeKey, or raw lastError.
export const AdminJobItemSchema = z
  .object({
    id: z.string().uuid(),
    kind: AdminJobKindSchema,
    status: AdminJobStatusSchema,
    attempts: z.number().int().nonnegative(),
    maxAttempts: z.number().int().positive(),
    runAfter: IsoDateTimeSchema,
    leaseExpiresAt: IsoDateTimeSchema.nullable(),
    lockedBy: z.string().min(1).nullable(),
    repository: AdminJobRepositorySchema,
    errorSummary: z.string().min(1).max(200).nullable(),
    isDistressed: z.boolean(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();
export type AdminJobItem = z.infer<typeof AdminJobItemSchema>;

export const AdminJobPageSchema = z
  .object({
    items: z.array(AdminJobItemSchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();
export type AdminJobPage = z.infer<typeof AdminJobPageSchema>;

export const AdminJobDetailSchema = AdminJobItemSchema;
export type AdminJobDetail = z.infer<typeof AdminJobDetailSchema>;

export const AdminQueueSnapshotSchema = z
  .object({
    pending: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    retrying: z.number().int().nonnegative(),
    succeededLast24h: z.number().int().nonnegative(),
    deadLast24h: z.number().int().nonnegative(),
  })
  .strict();
export type AdminQueueSnapshot = z.infer<typeof AdminQueueSnapshotSchema>;

export const AdminWorkerHeartbeatStatusSchema = z.enum(["ok", "stale", "unknown"]);
export type AdminWorkerHeartbeatStatus = z.infer<typeof AdminWorkerHeartbeatStatusSchema>;

export const AdminWorkerHeartbeatItemSchema = z
  .object({
    workerId: z.string().min(1),
    lastSeenAt: IsoDateTimeSchema,
    startedAt: IsoDateTimeSchema,
    ageSeconds: z.number().int().nonnegative(),
    status: z.enum(["ok", "stale"]),
  })
  .strict();
export type AdminWorkerHeartbeatItem = z.infer<typeof AdminWorkerHeartbeatItemSchema>;

export const AdminCodexPathStatusSchema = z.enum(["recent_success", "aging", "no_success"]);
export type AdminCodexPathStatus = z.infer<typeof AdminCodexPathStatusSchema>;

// Ops health facts only — never live Codex probe output or secrets.
export const AdminHealthPayloadSchema = z
  .object({
    checkedAt: IsoDateTimeSchema,
    worker: z
      .object({
        status: AdminWorkerHeartbeatStatusSchema,
        staleAfterSeconds: z.number().int().positive(),
        workers: z.array(AdminWorkerHeartbeatItemSchema),
      })
      .strict(),
    codexPath: z
      .object({
        status: AdminCodexPathStatusSchema,
        lastReviewPullSucceededAt: IsoDateTimeSchema.nullable(),
        reviewPullSucceededLast24h: z.number().int().nonnegative(),
        reviewPullFailedLast24h: z.number().int().nonnegative(),
        note: z.string().min(1),
      })
      .strict(),
    queue: z
      .object({
        pending: z.number().int().nonnegative(),
        distressedJobs: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type AdminHealthPayload = z.infer<typeof AdminHealthPayloadSchema>;

export const AdminOverviewPayloadSchema = z
  .object({
    metrics: z
      .object({
        pendingUsers: z.number().int().nonnegative(),
        workspaces: z.number().int().nonnegative(),
        enabledRepositories: z.number().int().nonnegative(),
        distressedJobs: z.number().int().nonnegative(),
      })
      .strict(),
    attention: z.array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("pending_users"), count: z.number().int().positive() }).strict(),
        z
          .object({
            kind: z.literal("suspended_installations"),
            count: z.number().int().positive(),
          })
          .strict(),
        z
          .object({
            kind: z.literal("distressed_jobs"),
            count: z.number().int().positive(),
          })
          .strict(),
        z.object({ kind: z.literal("worker_stale"), count: z.number().int().positive() }).strict(),
        z
          .object({ kind: z.literal("worker_unknown"), count: z.number().int().positive() })
          .strict(),
      ]),
    ),
    queueSnapshot: AdminQueueSnapshotSchema,
    recentAudit: z.array(AdminAuditItemSchema).max(5),
  })
  .strict();
export type AdminOverviewPayload = z.infer<typeof AdminOverviewPayloadSchema>;
