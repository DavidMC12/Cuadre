-- El dueño necesita fijar el monto de meses que ya pasaron (ej. cuánto fue el
-- mercado de enero). El disparador de 0006 lo impedía a nivel de base; ya no
-- aplica. La tabla sigue siendo solo-INSERT: un monto nunca se pisa, una fila
-- más nueva para el mismo mes gana (ver `objetivoEnElMes` en el repository).
DROP TRIGGER IF EXISTS budget_item_targets_not_backdated ON budget_item_targets;
--> statement-breakpoint
DROP FUNCTION IF EXISTS cuadre_check_budget_target_not_backdated();
