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

export const AdminOverviewPayloadSchema = z
  .object({
    metrics: z.object({ pendingUsers: z.number().int().nonnegative() }).strict(),
    attention: z.array(
      z.object({ kind: z.literal("pending_users"), count: z.number().int().positive() }).strict(),
    ),
    recentAudit: z.array(AdminAuditItemSchema).max(5),
  })
  .strict();
export type AdminOverviewPayload = z.infer<typeof AdminOverviewPayloadSchema>;
