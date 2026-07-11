ALTER TABLE "installations" ADD COLUMN "github_account_id" bigint;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repositories" ADD CONSTRAINT "repositories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
