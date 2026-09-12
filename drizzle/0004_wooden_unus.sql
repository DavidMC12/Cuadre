CREATE TABLE "admin_impersonations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"target_auth_subject" text NOT NULL,
	"target_email" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_impersonations_subject_not_blank" CHECK (length(btrim("admin_impersonations"."target_auth_subject")) > 0),
	CONSTRAINT "admin_impersonations_email_not_blank" CHECK (length(btrim("admin_impersonations"."target_email")) > 0)
);
--> statement-breakpoint
ALTER TABLE "admin_impersonations" ADD CONSTRAINT "admin_impersonations_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_impersonations_timeline_idx" ON "admin_impersonations" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_impersonations_admin_idx" ON "admin_impersonations" USING btree ("admin_user_id","started_at" DESC NULLS LAST);