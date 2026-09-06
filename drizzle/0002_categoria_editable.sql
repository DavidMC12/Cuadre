-- La categoria de un movimiento se puede corregir. Nada mas.
--
-- Hasta ahora un movimiento no se podia tocar en absoluto. Esa regla existe
-- para que el dinero cuadre: el monto, la fecha y la cuenta son historia y la
-- historia no se reescribe.
--
-- La categoria es distinta. Es una etiqueta que le ponemos encima para poder
-- decir "esto fue comida". Equivocarse ahi no descuadra ninguna cuenta, y
-- obligar a anular y recrear el movimiento por un error de dedo dejaria tres
-- filas de basura en el historial cada vez.
--
-- Asi que se abre una rendija, y solo una: si lo unico que cambia entre la fila
-- vieja y la nueva es `category_id`, se permite. Cualquier otra cosa sigue
-- prohibida, y el DELETE sigue prohibido siempre.


--------------------------------------------------------------------------------
-- Como se comparan las dos filas
--------------------------------------------------------------------------------
-- Se convierten a JSON, se les quita la categoria a ambas y se comparan enteras.
-- Si al ignorar la categoria son identicas, entonces la categoria era lo unico
-- que cambiaba.
--
-- Se hace asi, y no columna por columna, a proposito: si algun dia alguien
-- agrega una columna nueva a `transactions` y se le olvida actualizar este
-- disparador, la comparacion la detecta sola y bloquea el cambio. Prefiere
-- equivocarse cerrando la puerta que dejandola abierta.

CREATE OR REPLACE FUNCTION cuadre_transactions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(OLD) - 'category_id') IS NOT DISTINCT FROM (to_jsonb(NEW) - 'category_id')
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION
      'Los movimientos son inmutables: lo unico que se puede corregir es la categoria (movimiento %). Para cambiar monto, fecha o cuenta, registra un movimiento que lo anule.',
      OLD.id;
  END IF;

  RAISE EXCEPTION
    'Los movimientos son inmutables: % no esta permitido sobre transactions (movimiento %). Registra un movimiento que lo anule.',
    TG_OP, OLD.id;
END;
$$;
