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

    expect(estado.previsto).toBe("1000000.0000");
    expect(estado.previstoUnidades).toBe(aUnidadesMinimas("1000000"));
    expect(estado.hayIngresos).toBe(true);
    expect(estado.hayGastos).toBe(true);
    expect(estado.real).toBe("500000.0000");
  });

  it("gastos mayores que ingresos: el previsto queda negativo para decirlo con palabras", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [ingreso("1000000"), gasto("2500000")],
      income: "1000000",
      expense: "2500000",
    });

    expect(estado.previsto).toBe("-1500000.0000");
    expect(estado.previstoUnidades).toBe(aUnidadesMinimas("-1500000"));
  });

  it("sin ingresos presupuestados: hay previsto, pero hayIngresos avisa el vacío", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [gasto("3000000")],
      income: "0",
      expense: "1000000",
    });

    expect(estado.previsto).toBe("-3000000.0000");
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
    expect(estado.previsto).toBe("2000000.0000");
    expect(estado.real).toBe("1500000.0000");
  });

  it("el ahorro no entra en el cálculo (decisión del dueño)", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [ingreso("3000000"), gasto("2000000"), ahorro("1000000")],
      income: "1000000",
      expense: "500000",
    });

    // Con o sin la meta de ahorro, el previsto sigue siendo 1 millón.
    expect(estado.previsto).toBe("1000000.0000");
  });

  it("0.1 + 0.2 da exactamente 0.3, no la aproximación del flotante", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [gasto("0.1"), gasto("0.2")],
      income: "0",
      expense: "0.3",
    });

    expect(estado.previsto).toBe("-0.3000");
    expect(estado.real).toBe("-0.3000");
    // Y el previsto menos el real queda en CERO exacto, no en un polvo de coma
    // flotante.
    expect(estado.previstoUnidades - estado.realUnidades).toBe(0n);
  });

  it("una moneda a la vez: la cuenta no mezcla, solo suma lo que llega", () => {
    // La función no sabe de monedas: el que llama ya filtró a la del Resumen.
    const estado = cuantoSobraEnElMes({
      renglones: [ingreso("10")],
      income: "10",
      expense: "0",
    });

    expect(estado.previsto).toBe("10.0000");
    expect(estado.real).toBe("10.0000");
  });

  it("un mes sin fila propia para el renglón todavía no promete nada (target null)", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [
        { kind: "category", categoryKind: "income", target: null },
        { kind: "category", categoryKind: "expense", target: null },
      ],
      income: "0",
      expense: "0",
    });

    expect(estado.previsto).toBe("0.0000");
    expect(estado.previstoUnidades).toBe(0n);
    expect(estado.hayIngresos).toBe(false);
    expect(estado.hayGastos).toBe(false);
  });
});
