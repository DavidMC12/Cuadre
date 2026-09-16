CREATE TABLE "budget_item_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_item_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_item_targets_amount_positive" CHECK ("budget_item_targets"."amount" > 0),
	CONSTRAINT "budget_item_targets_effective_from_is_month_start" CHECK (extract(day from "budget_item_targets"."effective_from") = 1)
);
--> statement-breakpoint
CREATE TABLE "budget_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"currency" char(3) NOT NULL,
	"category_id" uuid,
	"account_id" uuid,
	"label" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_items_kind_valid" CHECK ("budget_items"."kind" in ('category', 'savings')),
	CONSTRAINT "budget_items_currency_format" CHECK ("budget_items"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "budget_items_label_not_blank" CHECK ("budget_items"."label" is null or length(btrim("budget_items"."label")) > 0),
	CONSTRAINT "budget_items_target_matches_kind" CHECK (("budget_items"."kind" = 'category' and "budget_items"."category_id" is not null and "budget_items"."account_id" is null)
       or ("budget_items"."kind" = 'savings'  and "budget_items"."account_id"  is not null and "budget_items"."category_id" is null))
);
--> statement-breakpoint
ALTER TABLE "budget_item_targets" ADD CONSTRAINT "budget_item_targets_budget_item_id_budget_items_id_fk" FOREIGN KEY ("budget_item_id") REFERENCES "public"."budget_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_category_fk" FOREIGN KEY ("user_id","category_id") REFERENCES "public"."categories"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_account_fk" FOREIGN KEY ("user_id","account_id","currency") REFERENCES "public"."accounts"("user_id","id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_item_targets_item_idx" ON "budget_item_targets" USING btree ("budget_item_id","effective_from" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "budget_items_user_idx" ON "budget_items" USING btree ("user_id");