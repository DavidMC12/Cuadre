CREATE TABLE "budget_item_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_item_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
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
	"category_kind" text,
	"account_id" uuid,
	"label" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_items_kind_valid" CHECK ("budget_items"."kind" in ('category', 'savings')),
	CONSTRAINT "budget_items_currency_format" CHECK ("budget_items"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "budget_items_label_not_blank" CHECK ("budget_items"."label" is null or length(btrim("budget_items"."label")) > 0),
	CONSTRAINT "budget_items_target_matches_kind" CHECK (("budget_items"."kind" = 'category' and "budget_items"."category_id" is not null and "budget_items"."account_id" is null)
       or ("budget_items"."kind" = 'savings'  and "budget_items"."account_id"  is not null and "budget_items"."category_id" is null)),
	CONSTRAINT "budget_items_category_kind_matches" CHECK (("budget_items"."kind" = 'category' and "budget_items"."category_kind" = 'expense')
       or ("budget_items"."kind" = 'savings'  and "budget_items"."category_kind" is null))
);
--> statement-breakpoint
-- Tiene que ir antes que `budget_items_category_fk` de más abajo: esa llave
-- foránea de tres columnas exige que exista primero esta llave única de tres
-- columnas en `categories`.
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_kind_unique" UNIQUE("user_id","id","kind");--> statement-breakpoint
ALTER TABLE "budget_item_targets" ADD CONSTRAINT "budget_item_targets_budget_item_id_budget_items_id_fk" FOREIGN KEY ("budget_item_id") REFERENCES "public"."budget_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_category_fk" FOREIGN KEY ("user_id","category_id","category_kind") REFERENCES "public"."categories"("user_id","id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_account_fk" FOREIGN KEY ("user_id","account_id","currency") REFERENCES "public"."accounts"("user_id","id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_item_targets_item_idx" ON "budget_item_targets" USING btree ("budget_item_id","effective_from" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "budget_items_user_idx" ON "budget_items" USING btree ("user_id");--> statement-breakpoint

--------------------------------------------------------------------------------
-- Reglas de dinero del presupuesto, aplicadas por la propia base de datos.
-- Mismo espíritu que 0001_reglas_de_dinero.sql: no son cortesías del backend,
-- son barreras en Postgres.
--------------------------------------------------------------------------------

-- 1. Un monto de presupuesto nunca se pisa: es inmutable, igual que los
-- movimientos. Si el monto cambió, se agrega una fila nueva (ver
-- `agregarObjetivo` en src/modules/budgets/repository.ts).

CREATE OR REPLACE FUNCTION cuadre_budget_item_targets_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION
    'Los montos de presupuesto son inmutables: % no esta permitido sobre budget_item_targets. Agrega una fila nueva con el monto correcto.',
    TG_OP;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER budget_item_targets_immutable
  BEFORE UPDATE OR DELETE ON budget_item_targets
  FOR EACH ROW
  EXECUTE FUNCTION cuadre_budget_item_targets_immutable();
--> statement-breakpoint

-- 2. Un monto nuevo solo puede regir desde el mes actual en adelante. Sin
-- esto, nada impediría que un cambio "de hoy" reescribiera cómo se vio un
-- mes que ya pasó, que es justo la promesa que existe esta tabla.

CREATE OR REPLACE FUNCTION cuadre_check_budget_target_not_backdated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.effective_from < date_trunc('month', clock_timestamp() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION
      'El monto de un item de presupuesto solo se puede cambiar desde el mes actual en adelante, nunca hacia atras.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER budget_item_targets_not_backdated
  BEFORE INSERT ON budget_item_targets
  FOR EACH ROW
  EXECUTE FUNCTION cuadre_check_budget_target_not_backdated();