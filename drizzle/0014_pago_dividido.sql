-- Una compra pagada con dos cuentas se guarda como dos gastos normales que
-- comparten `payment_group_id`: es un solo hecho, así que se ven y se anulan
-- juntos (igual que las dos patas de una transferencia). Columna nueva y
-- nula: no toca ningún movimiento existente. El disparador de inmutabilidad
-- (0002/0012) la protege solo: cualquier cambio fuera de categoría e ítem se
-- rechaza.

ALTER TABLE "transactions" ADD COLUMN "payment_group_id" uuid;--> statement-breakpoint
CREATE INDEX "transactions_payment_group_idx" ON "transactions" USING btree ("payment_group_id") WHERE payment_group_id is not null;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_group_is_standard" CHECK ("transactions"."payment_group_id" is null or "transactions"."kind" = 'standard');