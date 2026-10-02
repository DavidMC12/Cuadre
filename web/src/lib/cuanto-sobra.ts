/**
 * "Cuánto me sobra este mes": la cuenta del cuadrito del Resumen.
 *
 * Definición del dueño: PREVISTO = lo que se espera recibir (ítems de ingreso
 * del presupuesto) menos lo que se espera gastar (ítems de gasto); REAL =
 * lo recibido menos lo hecho hasta hoy, con los totales que ya expone el
 * resumen del mes. El AHORRO NO entra: una meta de aportar a un apartado no
 * es dinero que se vaya, es decir, no es "gasto".
 *
 * Es una función pura y a propósito todo vive en enteros grandes (BigInt en
 * diezmilésimas, como NUMERIC(19,4)): 0.1 + 0.2 no da 0.3 en coma flotante y
 * esta cifra decide si el dueño siente que el mes le cuadra o no.
 *
 * Una moneda a la vez: quien llama ya filtró los renglones y los totales a
 * LA moneda del Resumen; aquí solo se suma — mezclar monedas es un error de
 * dinero, no un detalle.
 */
import { aUnidadesMinimas, restar, sumarMontos } from "@/lib/money";
import type { ItemDelChecklist } from "@/lib/api/types";

export interface RenglonesParaCuantoSobra {
  /** Los renglones del checklist del mes, ya en la moneda del Resumen. */
  renglones: Pick<ItemDelChecklist, "kind" | "categoryKind" | "target">[];
  /** Total de ingresos del mes (positivo, como lo expone el resumen). */
  income: string;
  /** Total de gastos del mes (positivo, como lo expone el resumen). */
  expense: string;
}

export interface CuantoSobra {
  /**
   * El previsto: ingresos esperados menos gastos esperados del presupuesto,
   * como texto exacto ("-1500000.0000"). Puede ser negativo (se presupuestó
   * gastar más de lo que se espera recibir) y la presentación lo dice con
   * palabras. Se arma con `sumarMontos` (BigInt), nunca con `Number`.
   */
  previsto: string;
  /** Lo mismo que `previsto`, en diezmilésimas enteras, para comparar signos. */
  previstoUnidades: bigint;
  /** ¿Hay al menos un ítem de ingresos con monto en el presupuesto? */
  hayIngresos: boolean;
  /** ¿Hay al menos un ítem de gastos con monto en el presupuesto? */
  hayGastos: boolean;
  /** Lo recibido menos lo hecho hasta hoy, con los totales del resumen. */
  real: string;
  /** Lo mismo que `real`, en diezmilésimas enteras. */
  realUnidades: bigint;
}

export function cuantoSobraEnElMes({
  renglones,
  income,
  expense,
}: RenglonesParaCuantoSobra): CuantoSobra {
  const ingresosPrevistos: string[] = [];
  const gastosPrevistos: string[] = [];

  for (const renglon of renglones) {
    // El ahorro está fuera del cálculo (decisión del dueño: la meta de un
    // apartado no es dinero que se vaya) y un mes sin fila propia todavía no
    // promete nada.
    if (renglon.kind !== "category" || renglon.target === null) continue;

    if (renglon.categoryKind === "income") {
      ingresosPrevistos.push(renglon.target);
    } else if (renglon.categoryKind === "expense") {
      gastosPrevistos.push(renglon.target);
    }
  }

  // Se arma con la misma aritmética exacta del resto del dinero (BigInt, sin
  // coma flotante): el previsto es ingresos − gastos. `restar` y no un
  // `-${gastos}` a mano: un total negativo futuro daría "--…" y se leería mal.
  const ingresos = sumarMontos(ingresosPrevistos);
  const gastos = sumarMontos(gastosPrevistos);
  const previsto = restar(ingresos, gastos);
  const real = restar(income, expense);

  return {
    previsto,
    previstoUnidades: aUnidadesMinimas(previsto),
    hayIngresos: ingresosPrevistos.length > 0,
    hayGastos: gastosPrevistos.length > 0,
    real,
    realUnidades: aUnidadesMinimas(real),
  };
}
