import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Shared base columns for every Folio table.
 *
 * Uses a `gen_random_uuid()`-defaulted uuid PK and `timestamptz`
 * created/updated columns. `updatedAt` is bumped in app code on
 * write (`$onUpdate`) so it stays correct regardless of trigger support.
 */
export function baseColumns() {
  return {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  };
}
