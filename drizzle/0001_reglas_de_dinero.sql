-- Reglas de dinero aplicadas por la propia base de datos.
--
-- Lo de abajo no son validaciones "de cortesia" del backend: son barreras en
-- Postgres. Aunque alguien entre con un cliente de SQL y escriba a mano, no
-- puede romperlas. Ningun mensaje de error incluye montos, por la regla de
-- nunca registrar cifras en los logs.


--------------------------------------------------------------------------------
-- 1. Los movimientos son inmutables
--------------------------------------------------------------------------------
-- Un movimiento jamas se edita ni se borra. Si quedo mal, se registra otro que
-- lo anula. Asi el historial siempre cuenta lo que de verdad paso.
--
-- Nota para el futuro: por esto mismo, borrar la cuenta de un usuario (Fase 5)
-- necesitara un procedimiento explicito y documentado, no un DELETE suelto.

CREATE OR REPLACE FUNCTION cuadre_transactions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION
    'Los movimientos son inmutables: % no esta permitido sobre transactions (movimiento %). Registra un movimiento que lo anule.',
    TG_OP, OLD.id;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER transactions_immutable
  BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION cuadre_transactions_immutable();
--> statement-breakpoint


--------------------------------------------------------------------------------
-- 2. Una anulacion tiene que anular de verdad
--------------------------------------------------------------------------------
-- Si una fila dice que anula a otra, debe ir en la misma cuenta, ser del mismo
-- tipo y llevar el monto exactamente opuesto. Que no quede un "anula" de
-- mentiras que descuadre las cuentas.

CREATE OR REPLACE FUNCTION cuadre_check_reversal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  original transactions%ROWTYPE;
BEGIN
  SELECT * INTO original
  FROM transactions
  WHERE id = NEW.reverses_transaction_id
    AND user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El movimiento que se intenta anular (%) no existe.',
      NEW.reverses_transaction_id;
  END IF;

  IF original.kind = 'opening' THEN
    RAISE EXCEPTION
      'El saldo inicial no se anula: corrigelo con un movimiento de ajuste (cuenta %).',
      original.account_id;
  END IF;

  IF original.reverses_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede anular una anulacion (movimiento %).', original.id;
  END IF;

  IF original.account_id <> NEW.account_id THEN
    RAISE EXCEPTION 'La anulacion debe ir en la misma cuenta que el movimiento anulado.';
  END IF;

  IF original.kind <> NEW.kind THEN
    RAISE EXCEPTION 'La anulacion debe ser del mismo tipo que el movimiento anulado (% vs %).',
      original.kind, NEW.kind;
  END IF;

  IF original.amount <> -NEW.amount THEN
    RAISE EXCEPTION 'La anulacion debe llevar el monto opuesto al del movimiento anulado.';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER transactions_check_reversal
  BEFORE INSERT ON transactions
  FOR EACH ROW
  WHEN (NEW.reverses_transaction_id IS NOT NULL)
  EXECUTE FUNCTION cuadre_check_reversal();
--> statement-breakpoint


--------------------------------------------------------------------------------
-- 3. Una transferencia siempre cuadra
--------------------------------------------------------------------------------
-- Mover plata entre cuentas propias son dos movimientos: uno que sale y otro
-- que entra, unidos por transfer_group_id. Deben ser exactamente dos, del mismo
-- dueno, en dos cuentas distintas, en la misma moneda, y sumar cero.
--
-- La revision se hace al confirmar la transaccion (DEFERRABLE INITIALLY
-- DEFERRED), no fila por fila: si no, la primera pata siempre fallaria por
-- estar sola. Consecuencia practica: las dos patas se insertan juntas, en la
-- misma transaccion de base de datos.
--
-- Transferencias entre monedas distintas quedan fuera por ahora. Cuando hagan
-- falta, se habilitan con su propia migracion.

CREATE OR REPLACE FUNCTION cuadre_check_transfer_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  patas    integer;
  total    numeric(19, 4);
  duenos   integer;
  cuentas  integer;
  monedas  integer;
BEGIN
  SELECT count(*),
         coalesce(sum(amount), 0),
         count(DISTINCT user_id),
         count(DISTINCT account_id),
         count(DISTINCT currency)
    INTO patas, total, duenos, cuentas, monedas
  FROM transactions
  WHERE transfer_group_id = NEW.transfer_group_id;

  IF patas <> 2 THEN
    RAISE EXCEPTION
      'Una transferencia son exactamente dos movimientos; el grupo % tiene %.',
      NEW.transfer_group_id, patas;
  END IF;

  IF duenos <> 1 THEN
    RAISE EXCEPTION 'Las dos patas de una transferencia deben ser del mismo usuario (grupo %).',
      NEW.transfer_group_id;
  END IF;

  IF cuentas <> 2 THEN
    RAISE EXCEPTION 'Una transferencia va entre dos cuentas distintas (grupo %).',
      NEW.transfer_group_id;
  END IF;

  IF monedas <> 1 THEN
    RAISE EXCEPTION
      'Las dos patas de una transferencia deben ser de la misma moneda (grupo %).',
      NEW.transfer_group_id;
  END IF;

  IF total <> 0 THEN
    RAISE EXCEPTION 'Los dos movimientos de una transferencia deben sumar cero (grupo %).',
      NEW.transfer_group_id;
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER transactions_transfer_group_balanced
  AFTER INSERT ON transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.transfer_group_id IS NOT NULL)
  EXECUTE FUNCTION cuadre_check_transfer_group();
--> statement-breakpoint


--------------------------------------------------------------------------------
-- 4. Los saldos se derivan
--------------------------------------------------------------------------------
-- No existe ninguna columna con el saldo de una cuenta. Esta vista lo calcula
-- sumando los movimientos, cada vez que se consulta. Por eso el saldo nunca
-- puede quedar descuadrado respecto al detalle: es el detalle.

CREATE VIEW account_balances AS
SELECT
  a.user_id,
  a.id                                   AS account_id,
  a.currency,
  coalesce(sum(t.amount), 0)::numeric(19, 4) AS balance,
  count(t.id)                            AS movement_count,
  max(t.occurred_at)                     AS last_movement_at
FROM accounts a
LEFT JOIN transactions t
       ON t.account_id = a.id
      AND t.user_id    = a.user_id
GROUP BY a.user_id, a.id, a.currency;
