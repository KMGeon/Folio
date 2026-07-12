import { z } from "zod";
import {
  AuditActionSchema,
  GlobalStatusSchema,
  MembershipStatusSchema,
  WorkspaceRoleSchema,
} from "./authorization.js";
import { IsoDateTimeSchema } from "./common.js";

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

export const AdminOverviewPayloadSchema = z
  .object({
    metrics: z
      .object({
        pendingUsers: z.number().int().nonnegative(),
        workspaces: z.number().int().nonnegative(),
        enabledRepositories: z.number().int().nonnegative(),
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
      ]),
    ),
    recentAudit: z.array(AdminAuditItemSchema).max(5),
  })
  .strict();
export type AdminOverviewPayload = z.infer<typeof AdminOverviewPayloadSchema>;
