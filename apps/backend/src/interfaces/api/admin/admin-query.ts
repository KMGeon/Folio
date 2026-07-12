import { AdminUserStatusFilterSchema, AuditActionSchema } from "@folio/types";
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

export type AdminUsersQuery = z.infer<typeof AdminUsersQuerySchema>;
export type AdminAuditQuery = z.infer<typeof AdminAuditQuerySchema>;

export function parseAdminUsersQuery(value: unknown): AdminUsersQuery {
  return parseQuery(AdminUsersQuerySchema, value);
}

export function parseAdminAuditQuery(value: unknown): AdminAuditQuery {
  return parseQuery(AdminAuditQuerySchema, value);
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
