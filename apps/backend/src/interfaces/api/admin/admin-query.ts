import {
  AdminJobKindSchema,
  AdminJobStatusSchema,
  AdminUserStatusFilterSchema,
  AdminWorkspaceInstallationStateSchema,
  AuditActionSchema,
} from "@folio/types";
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const ListQueryFields = {
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().min(1).optional(),
};

const AdminUsersQuerySchema = z.object({
  ...ListQueryFields,
  status: AdminUserStatusFilterSchema.default("all"),
});

const AdminAuditQuerySchema = z.object({
  ...ListQueryFields,
  action: AuditActionSchema.optional(),
  workspaceId: z.string().uuid().optional(),
  actorUserId: z.string().uuid().optional(),
  targetId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const AdminWorkspacesQuerySchema = z.object({
  ...ListQueryFields,
  installationState: AdminWorkspaceInstallationStateSchema.optional(),
});

const AdminJobsQuerySchema = z
  .object({
    ...ListQueryFields,
    status: AdminJobStatusSchema.optional(),
    kind: AdminJobKindSchema.optional(),
    distressed: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .optional()
      .transform((value) => value === true || value === "true"),
  })
  .transform((value) => {
    const jobId =
      value.q &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.q)
        ? value.q
        : undefined;
    return {
      limit: value.limit,
      cursor: value.cursor,
      status: value.status,
      kind: value.kind,
      distressed: value.distressed || undefined,
      jobId,
    };
  });

export type AdminUsersQuery = z.infer<typeof AdminUsersQuerySchema>;
export type AdminAuditQuery = z.infer<typeof AdminAuditQuerySchema>;
export type AdminWorkspacesQuery = z.infer<typeof AdminWorkspacesQuerySchema>;
export type AdminJobsQuery = z.infer<typeof AdminJobsQuerySchema>;

export function parseAdminUsersQuery(value: unknown): AdminUsersQuery {
  return parseQuery(AdminUsersQuerySchema, value);
}

export function parseAdminAuditQuery(value: unknown): AdminAuditQuery {
  return parseQuery(AdminAuditQuerySchema, value);
}

export function parseAdminWorkspacesQuery(value: unknown): AdminWorkspacesQuery {
  return parseQuery(AdminWorkspacesQuerySchema, value);
}

export function parseAdminJobsQuery(value: unknown): AdminJobsQuery {
  return parseQuery(AdminJobsQuerySchema, value);
}

function parseQuery<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException("Invalid admin query");
  }
  return parsed.data;
}
