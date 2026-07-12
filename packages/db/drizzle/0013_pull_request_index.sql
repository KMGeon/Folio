CREATE TABLE "pull_request_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"repo_id" uuid NOT NULL,
	"github_pr_number" integer NOT NULL,
	"title" text NOT NULL,
	"author_login" text NOT NULL,
	"base_ref" text NOT NULL,
	"head_ref" text NOT NULL,
	"head_sha" text NOT NULL,
	"github_state" text NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"merged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"github_updated_at" timestamp with time zone NOT NULL,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"changed_files" integer DEFAULT 0 NOT NULL,
	"labels_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"html_url" text NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pull_request_index" ADD CONSTRAINT "pull_request_index_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "pull_request_index_repo_number_unique" ON "pull_request_index" USING btree ("repo_id","github_pr_number");
--> statement-breakpoint
CREATE INDEX "pull_request_index_repo_updated_idx" ON "pull_request_index" USING btree ("repo_id","github_updated_at");
--> statement-breakpoint
CREATE INDEX "pull_request_index_repo_state_updated_idx" ON "pull_request_index" USING btree ("repo_id","github_state","github_updated_at");
--> statement-breakpoint
CREATE INDEX "pull_request_index_author_updated_idx" ON "pull_request_index" USING btree ("author_login","github_updated_at");
--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "pr_index_status" text DEFAULT 'idle' NOT NULL;
--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "pr_index_backfilled_at" timestamp with time zone;
