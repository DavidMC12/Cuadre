CREATE TABLE "savings_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_entries_amount_not_zero" CHECK ("savings_entries"."amount" <> 0),
	CONSTRAINT "savings_entries_currency_format" CHECK ("savings_entries"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "savings_entries_description_not_blank" CHECK ("savings_entries"."description" is null or length(btrim("savings_entries"."description")) > 0)
);
--> statement-breakpoint
ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_account_fk" FOREIGN KEY ("user_id","account_id","currency") REFERENCES "public"."accounts"("user_id","id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "savings_entries_account_idx" ON "savings_entries" USING btree ("user_id","account_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint

-- Un registro de ahorro, igual que un movimiento, nunca se edita ni se borra:
-- si quedó mal, se anota otro de signo contrario.

CREATE OR REPLACE FUNCTION cuadre_savings_entries_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION
    'Los registros de ahorro son inmutables: % no esta permitido sobre savings_entries. Anota otro registro de signo contrario.',
    TG_OP;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER savings_entries_immutable
  BEFORE UPDATE OR DELETE ON savings_entries
  FOR EACH ROW
  EXECUTE FUNCTION cuadre_savings_entries_immutable();
