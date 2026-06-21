ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
UPDATE "users" SET "status" = 'approved';--> statement-breakpoint
