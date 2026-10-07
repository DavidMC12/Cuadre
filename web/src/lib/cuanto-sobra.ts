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
  /**
   * ¿Hubo algún movimiento este mes? `realUnidades === 0` es la RED, no la
   * ausencia: ingresos iguales a gastos dan cero sin que el mes esté vacío.
   */
  hayMovimientos: boolean;
}

/** Los dos totales del mes previsto, cada uno con su aritmética exacta. */
export interface TotalesPrevistos {
  /** Suma exacta de los montos del mes de los renglones de ingreso. */
  ingresos: string;
  /** Suma exacta de los montos del mes de los renglones de gasto. */
  gastos: string;
  /** ¿Hay al menos un renglón de ingreso con monto en el mes? */
  hayIngresos: boolean;
  /** ¿Hay al menos un renglón de gasto con monto en el mes? */
  hayGastos: boolean;
}

/**
 * Los dos totales del mes previsto —ingresos y gastos— en UNA sola cuenta.
 *
 * Es la única fuente: `cuantoSobraEnElMes` resta estos mismos totales y el
 * panel del presupuesto los muestra en los encabezados de sección, así que el
 * previsto del cuadrito y la resta a simple vista del panel NUNCA pueden
 * diferir. Las reglas del cálculo viven aquí una vez: solo cuentan los
 * renglones de categoría (`kind === "category"`) con monto fijado para el mes
 * visto (`target` no nulo); el ahorro queda fuera (decisión del dueño) y un
 * `"0.0000"` (`Este mes no aplica`) suma cero. `hayIngresos`/`hayGastos`
 * distinguen "el lado existe con monto" de "no hay renglones": es lo que deja
 * mostrar el total solo cuando la sección de verdad tiene algo que sumar.
 *
 * Una moneda a la vez: quien llama ya filtró los renglones a LA moneda de la
 * pantalla; aquí solo se suma, con la misma aritmética exacta (BigInt, sin
 * coma flotante) de todo el dinero.
 */
export function totalesPrevistos(
  renglones: RenglonesParaCuantoSobra["renglones"]
): TotalesPrevistos {
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

  return {
    ingresos: sumarMontos(ingresosPrevistos),
    gastos: sumarMontos(gastosPrevistos),
    hayIngresos: ingresosPrevistos.length > 0,
    hayGastos: gastosPrevistos.length > 0,
  };
}

export function cuantoSobraEnElMes({
  renglones,
  income,
  expense,
}: RenglonesParaCuantoSobra): CuantoSobra {
  // Se arma con la misma aritmética exacta del resto del dinero (BigInt, sin
  // coma flotante): el previsto es ingresos − gastos. `restar` y no un
  // `-${gastos}` a mano: un total negativo futuro daría "--…" y se leería mal.
  const { ingresos, gastos, hayIngresos, hayGastos } = totalesPrevistos(renglones);
  const previsto = restar(ingresos, gastos);
  const real = restar(income, expense);
  // La red puede dar cero con movimiento de sobra (entró tanto como salió):
  // por eso se mira cada lado, no la resta.
  const hayMovimientos = aUnidadesMinimas(income) !== 0n || aUnidadesMinimas(expense) !== 0n;

  return {
    previsto,
    previstoUnidades: aUnidadesMinimas(previsto),
    hayIngresos,
    hayGastos,
    real,
    realUnidades: aUnidadesMinimas(real),
    hayMovimientos,
  };
}
