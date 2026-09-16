ALTER TABLE "accounts" ADD COLUMN "credit_limit" numeric(19, 4);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "linked_account_id" uuid;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_linked_account_fk" FOREIGN KEY ("user_id","linked_account_id","currency") REFERENCES "public"."accounts"("user_id","id","currency") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_savings_not_for_card" CHECK ("accounts"."type" <> 'card' or not "accounts"."is_savings");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_credit_limit_only_for_card" CHECK ("accounts"."type" = 'card' or "accounts"."credit_limit" is null);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_credit_limit_positive" CHECK ("accounts"."credit_limit" is null or "accounts"."credit_limit" > 0);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_linked_account_only_for_card" CHECK ("accounts"."type" = 'card' or "accounts"."linked_account_id" is null);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_linked_account_not_self" CHECK ("accounts"."linked_account_id" is distinct from "accounts"."id");