CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"auth_provider" text,
	"auth_subject" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_email_shape" CHECK ("users"."email" ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
	CONSTRAINT "users_display_name_not_blank" CHECK (length(btrim("users"."display_name")) > 0),
	CONSTRAINT "users_auth_identity_complete" CHECK (("users"."auth_provider" is null) = ("users"."auth_subject" is null))
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"currency" char(3) NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_tenant_currency_unique" UNIQUE("user_id","id","currency"),
	CONSTRAINT "accounts_type_valid" CHECK ("accounts"."type" in ('bank', 'card', 'cash')),
	CONSTRAINT "accounts_currency_format" CHECK ("accounts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "accounts_name_not_blank" CHECK (length(btrim("accounts"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"parent_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_tenant_unique" UNIQUE("user_id","id"),
	CONSTRAINT "categories_kind_valid" CHECK ("categories"."kind" in ('income', 'expense')),
	CONSTRAINT "categories_name_not_blank" CHECK (length(btrim("categories"."name")) > 0),
	CONSTRAINT "categories_no_self_parent" CHECK ("categories"."parent_id" is distinct from "categories"."id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"kind" text DEFAULT 'standard' NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"description" text,
	"transfer_group_id" uuid,
	"reverses_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_tenant_unique" UNIQUE("user_id","id"),
	CONSTRAINT "transactions_reversal_unique" UNIQUE("reverses_transaction_id"),
	CONSTRAINT "transactions_amount_not_zero" CHECK ("transactions"."amount" <> 0),
	CONSTRAINT "transactions_currency_format" CHECK ("transactions"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "transactions_kind_valid" CHECK ("transactions"."kind" in ('opening', 'standard', 'transfer')),
	CONSTRAINT "transactions_description_not_blank" CHECK ("transactions"."description" is null or length(btrim("transactions"."description")) > 0),
	CONSTRAINT "transactions_transfer_group_consistent" CHECK (("transactions"."kind" = 'transfer') = ("transactions"."transfer_group_id" is not null)),
	CONSTRAINT "transactions_transfer_has_no_category" CHECK ("transactions"."kind" <> 'transfer' or "transactions"."category_id" is null),
	CONSTRAINT "transactions_opening_is_bare" CHECK ("transactions"."kind" <> 'opening' or ("transactions"."category_id" is null and "transactions"."reverses_transaction_id" is null))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_fk" FOREIGN KEY ("user_id","parent_id") REFERENCES "public"."categories"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_fk" FOREIGN KEY ("user_id","account_id","currency") REFERENCES "public"."accounts"("user_id","id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_fk" FOREIGN KEY ("user_id","category_id") REFERENCES "public"."categories"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reversal_fk" FOREIGN KEY ("user_id","reverses_transaction_id") REFERENCES "public"."transactions"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_identity_unique" ON "users" USING btree ("auth_provider","auth_subject") WHERE "users"."auth_subject" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_name_unique" ON "accounts" USING btree ("user_id","name") WHERE "accounts"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_kind_name_unique" ON "categories" USING btree ("user_id","kind","name") WHERE "categories"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "categories_user_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_one_opening_per_account" ON "transactions" USING btree ("user_id","account_id") WHERE kind = 'opening';--> statement-breakpoint
CREATE INDEX "transactions_account_timeline_idx" ON "transactions" USING btree ("user_id","account_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_user_timeline_idx" ON "transactions" USING btree ("user_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("user_id","category_id") WHERE category_id is not null;--> statement-breakpoint
CREATE INDEX "transactions_transfer_group_idx" ON "transactions" USING btree ("transfer_group_id") WHERE transfer_group_id is not null;