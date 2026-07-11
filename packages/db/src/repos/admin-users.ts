import { GLOBAL_STATUS, type GlobalStatus } from "@folio/types";
import { and, count, desc, eq, ilike, lt, or } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type UserRow, users } from "../schema/users.js";

export interface AdminUserCursor {
  createdAt: Date;
  id: string;
}

export interface AdminUserListInput {
  q?: string;
  status?: GlobalStatus;
  limit: number;
  cursor?: AdminUserCursor;
}

export interface AdminUserPageRow {
  items: UserRow[];
  hasMore: boolean;
}

export const adminUsersRepo = {
  async list(input: AdminUserListInput, db: Db = getDb()): Promise<AdminUserPageRow> {
    const query = input.q?.trim();
    const searchPattern = query ? `%${query}%` : undefined;
    const search = searchPattern
      ? or(ilike(users.login, searchPattern), ilike(users.email, searchPattern))
      : undefined;
    const afterCursor = input.cursor
      ? or(
          lt(users.createdAt, input.cursor.createdAt),
          and(eq(users.createdAt, input.cursor.createdAt), lt(users.id, input.cursor.id)),
        )
      : undefined;

    const rows = await db
      .select()
      .from(users)
      .where(
        and(search, input.status ? eq(users.globalStatus, input.status) : undefined, afterCursor),
      )
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(input.limit + 1);

    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  },

  async countPending(db: Db = getDb()): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(users)
      .where(eq(users.globalStatus, GLOBAL_STATUS.PENDING));
    return row?.value ?? 0;
  },
};
