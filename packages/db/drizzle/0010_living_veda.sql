ALTER TABLE "users" ADD COLUMN "global_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_system_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "one_system_admin" ON "users" USING btree ("is_system_admin") WHERE "users"."is_system_admin" = true;