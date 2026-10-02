/**
 * Pruebas de la cuenta de "cuánto me sobra este mes": es dinero, así que la
 * exactitud es la prueba y no un detalle — los casos de borde de coma
 * flotante (0.1 + 0.2) viven aquí a propósito.
 */
import { describe, expect, it } from "vitest";

import { aUnidadesMinimas } from "@/lib/money";
import { cuantoSobraEnElMes } from "@/lib/cuanto-sobra";

type Renglon = {
  kind: "category" | "savings";
  categoryKind: "expense" | "income" | null;
  target: string | null;
};

const ingreso = (target: string): Renglon => ({
  kind: "category",
  categoryKind: "income",
  target,
});
const gasto = (target: string): Renglon => ({
  kind: "category",
  categoryKind: "expense",
  target,
});
const ahorro = (target: string): Renglon => ({
  kind: "savings",
  categoryKind: null,
  target,
});

describe("cuantoSobraEnElMes", () => {
  it("ingresos mayores que gastos: me sobra", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [ingreso("3000000"), gasto("2000000")],
      income: "1000000",
      expense: "500000",
    });

    expect(estado.previsto).toBe(aUnidadesMinimas("1000000"));
    expect(estado.real).toBe(aUnidadesMinimas("500000"));
  });

  it("gastos mayores que ingresos: el previsto queda negativo para decirlo con palabras", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [ingreso("1000000"), gasto("2500000")],
      income: "1000000",
      expense: "2500000",
    });

    expect(estado.previsto).toBe(aUnidadesMinimas("-1500000"));
  });

  it("sin ingresos presupuestados: hay previsto, pero hayIngresos avisa el vacío", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [gasto("3000000")],
      income: "0",
      expense: "1000000",
    });

    expect(estado.previsto).toBe(aUnidadesMinimas("-3000000"));
    expect(estado.hayIngresos).toBe(false);
    expect(estado.hayGastos).toBe(true);
  });

  it("sin gastos presupuestados: igual se cuenta lo recibido", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [ingreso("2000000")],
      income: "1500000",
      expense: "0",
    });

    expect(estado.hayIngresos).toBe(true);
    expect(estado.hayGastos).toBe(false);
    expect(estado.previsto).toBe(aUnidadesMinimas("2000000"));
    expect(estado.real).toBe(aUnidadesMinimas("1500000"));
  });

  it("el ahorro no entra en el cálculo (decisión del dueño)", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [ingreso("3000000"), gasto("2000000"), ahorro("1000000")],
      income: "1000000",
      expense: "500000",
    });

    // Con o sin la meta de ahorro, el previsto sigue siendo 1 millón.
    expect(estado.previsto).toBe(aUnidadesMinimas("1000000"));
  });

  it("0.1 + 0.2 da exactamente 0.3, no la aproximación del flotante", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [gasto("0.1"), gasto("0.2")],
      income: "0",
      expense: "0.3",
    });

    expect(estado.previsto).toBe(aUnidadesMinimas("-0.3"));
    expect(estado.real).toBe(aUnidadesMinimas("-0.3"));
    // Y el sobrante entre previsto y real queda en CERO exacto, no en un
    // polvo de coma flotante.
    expect(estado.porVivir).toBe(0n);
  });

  it("los totales llegan por fuera: una moneda a la vez, nunca se mezclan aquí", () => {
    // La función no sabe de monedas: el que llama ya filtró. Si se le
    // entregan cifras de dos monedas mezcladas, la suma es la de los strings
    // que llegaron; el cuadrito nunca llega aquí con dos monedas porque
    // consulta una sola.
    const estado = cuantoSobraEnElMes({
      renglones: [ingreso("10")],
      income: "10",
      expense: "0",
    });

    expect(estado.previsto).toBe(aUnidadesMinimas("10"));
    expect(estado.real).toBe(aUnidadesMinimas("10"));
  });

  it("un mes sin fila propia para el renglón todavía no prometa nada (target null)", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [
        { kind: "category", categoryKind: "income", target: null },
        { kind: "category", categoryKind: "expense", target: null },
      ],
      income: "0",
      expense: "0",
    });

    expect(estado.previsto).toBe(0n);
    expect(estado.hayIngresos).toBe(false);
    expect(estado.hayGastos).toBe(false);
  });
});
