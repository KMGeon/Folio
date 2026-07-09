CREATE TABLE "key_change_review_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid NOT NULL,
  "chapter_id" uuid NOT NULL,
  "key_change_id" text NOT NULL,
  "viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "key_change_review_state"
  ADD CONSTRAINT "key_change_review_state_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "key_change_review_state"
  ADD CONSTRAINT "key_change_review_state_chapter_id_chapters_id_fk"
  FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "key_change_review_state_user_chapter_key_unique"
  ON "key_change_review_state" USING btree ("user_id", "chapter_id", "key_change_id");
