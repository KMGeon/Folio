-- 0015 was skipped by existing databases because its journal timestamp predates 0014.
ALTER TABLE "repositories" ADD COLUMN IF NOT EXISTS "ai_reply_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'normal' NOT NULL;
