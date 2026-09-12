ALTER TABLE "users" ADD COLUMN "default_currency" char(3);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "start_page" text DEFAULT 'resumen' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_default_currency_format" CHECK ("users"."default_currency" is null or "users"."default_currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_start_page_valid" CHECK ("users"."start_page" in ('resumen', 'cuentas', 'movimientos'));