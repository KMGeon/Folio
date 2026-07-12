ALTER TABLE "repositories" ADD COLUMN "ai_reply_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
