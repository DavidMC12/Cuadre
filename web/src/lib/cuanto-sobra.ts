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
import { aUnidadesMinimas } from "@/lib/money";
import type { ItemDelChecklist } from "@/lib/api/types";

export interface RenglonesParaCuantoSobra {
  /** Los renglones del checklist del mes, ya en la moneda del Resumen. */
  renglones: Pick<ItemDelChecklist, "kind" | "categoryKind" | "target">[];
  /** Total de ingresos del mes (positivo, como lo expone el resumen). */
  income: string;
  /** Total de gastos del mes (positivo, aunque en la base sean negativos). */
  expense: string;
}

export interface CuantoSobra {
  /**
   * El previsto: ingresos esperados menos gastos esperados del presupuesto,
   * en diezmilésimas. Puede ser negativo (se presupuestó gastar más de lo
   * que se espera recibir) y la presentación lo dice con palabras.
   */
  previsto: bigint;
  /** ¿Hay al menos un ítem de ingresos con monto en el presupuesto? */
  hayIngresos: boolean;
  /** ¿Hay al menos un ítem de gastos con monto en el presupuesto? */
  hayGastos: boolean;
  /** Lo recibido menos lo hecho hasta hoy, con los totales del resumen. */
  real: bigint;
  /**
   * Lo que falta por vivir hasta el fin del mes: el previsto que todavía no
   * se ha hecho real (positivo, queda por gastar/ingresar; negativo, se
   * vivió más de lo previsto).
   */
  porVivir: bigint;
}

export function cuantoSobraEnElMes({
  renglones,
  income,
  expense,
}: RenglonesParaCuantoSobra): CuantoSobra {
  let ingresosPrevistos = 0n;
  let gastosPrevistos = 0n;
  let hayIngresos = false;
  let hayGastos = false;

  for (const renglon of renglones) {
    // El ahorro está fuera del cálculo (decisión del dueño: la meta de un
    // apartado no es dinero que se vaya) y un mes sin fila propia todavía no
    // promete nada.
    if (renglon.kind !== "category" || renglon.target === null) continue;

    if (renglon.categoryKind === "income") {
      hayIngresos = true;
      ingresosPrevistos += aUnidadesMinimas(renglon.target);
    } else if (renglon.categoryKind === "expense") {
      hayGastos = true;
      gastosPrevistos += aUnidadesMinimas(renglon.target);
    }
  }

  const previsto = ingresosPrevistos - gastosPrevistos;
  const real = aUnidadesMinimas(income) - aUnidadesMinimas(expense);

  return {
    previsto,
    hayIngresos,
    hayGastos,
    real,
    porVivir: previsto - real,
  };
}
