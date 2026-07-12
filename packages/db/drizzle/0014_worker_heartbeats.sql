CREATE TABLE "worker_heartbeats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"worker_id" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "worker_heartbeats_worker_id_uq" ON "worker_heartbeats" USING btree ("worker_id");
