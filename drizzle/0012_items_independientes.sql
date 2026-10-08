-- Cada movimiento cuenta para UN solo ítem del presupuesto.
--
-- Hasta ahora el presupuesto medía por categoría: un gasto en "Deudas" contaba
-- completo en los siete ítems de Deudas a la vez. Ahora un movimiento puede
-- apuntar a un ítem (`budget_item_id`) y cada ítem suma solo lo suyo. Lo que no
-- apunta a ninguno queda "sin asignar" dentro de su categoría.

--------------------------------------------------------------------------------
-- 1. Las llaves a las que apuntan los movimientos
--------------------------------------------------------------------------------
-- Van primero: Postgres exige que la llave única exista antes de la foránea.

ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_tenant_unique" UNIQUE("user_id","id");--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_tenant_category_currency_unique" UNIQUE("user_id","id","category_id","currency");--> statement-breakpoint

ALTER TABLE "transactions" ADD COLUMN "budget_item_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_budget_item_fk" FOREIGN KEY ("user_id","budget_item_id") REFERENCES "public"."budget_items"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_budget_item_category_fk" FOREIGN KEY ("user_id","budget_item_id","category_id","currency") REFERENCES "public"."budget_items"("user_id","id","category_id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_budget_item_needs_category" CHECK ("transactions"."budget_item_id" is null or "transactions"."category_id" is not null or "transactions"."kind" = 'transfer');--> statement-breakpoint

--------------------------------------------------------------------------------
-- 2. El ítem es una etiqueta corregible, igual que la categoría
--------------------------------------------------------------------------------
-- El disparador de inmutabilidad (0002) deja pasar un UPDATE si lo único que
-- cambió es `category_id`. Ahora también `budget_item_id`: equivocarse de ítem
-- no descuadra ninguna cuenta, y anular y recrear el movimiento por eso dejaría
-- tres filas de basura. Monto, fecha y cuenta siguen intocables, y el DELETE
-- sigue prohibido siempre.

CREATE OR REPLACE FUNCTION cuadre_transactions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(OLD) - 'category_id' - 'budget_item_id')
         IS NOT DISTINCT FROM (to_jsonb(NEW) - 'category_id' - 'budget_item_id')
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION
      'Los movimientos son inmutables: lo unico que se puede corregir es la categoria y el item de presupuesto (movimiento %). Para cambiar monto, fecha o cuenta, registra un movimiento que lo anule.',
      OLD.id;
  END IF;

  RAISE EXCEPTION
    'Los movimientos son inmutables: % no esta permitido sobre transactions (movimiento %). Registra un movimiento que lo anule.',
    TG_OP, OLD.id;
END;
$$;
--> statement-breakpoint

--------------------------------------------------------------------------------
-- 3. Lo que ya estaba registrado
--------------------------------------------------------------------------------
-- Si una categoría (en una moneda) tiene UN solo ítem, no hay duda de a cuál
-- pertenecen sus movimientos de siempre: se asignan a ese. Donde hay varios
-- (Deudas) no se adivina: quedan "sin asignar" y los asigna su dueño.
-- Los gastos/ingresos normales y sus anulaciones se mueven juntos (las
-- anulaciones copian la categoría de su original). Se hace una sola vez, aquí.

UPDATE "transactions" t
   SET "budget_item_id" = unico.item_id
  FROM (
    SELECT bi.user_id,
           bi.category_id,
           bi.currency,
           (array_agg(bi.id))[1] AS item_id
      FROM "budget_items" bi
     WHERE bi.kind = 'category'
     GROUP BY bi.user_id, bi.category_id, bi.currency
    HAVING count(*) = 1
  ) unico
 WHERE t.user_id = unico.user_id
   AND t.category_id = unico.category_id
   AND t.currency = unico.currency
   AND t.kind = 'standard'
   AND t.budget_item_id IS NULL;
