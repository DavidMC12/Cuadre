/**
 * Pruebas de la cuenta de "cuánto me sobra este mes": es dinero, así que la
 * exactitud es la prueba y no un detalle — los casos de borde de coma
 * flotante (0.1 + 0.2) viven aquí a propósito.
 */
import { describe, expect, it } from "vitest";

import { aUnidadesMinimas } from "@/lib/money";
import { cuantoSobraEnElMes, totalesPrevistos } from "@/lib/cuanto-sobra";

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

  it("la red en cero con movimiento en ambos lados no es un mes vacío", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [],
      income: "500000",
      expense: "500000",
    });

    expect(estado.realUnidades).toBe(0n);
    // El neto es cero, pero sí hubo movimientos: no es el vacío del mes.
    expect(estado.hayMovimientos).toBe(true);
  });

  it("sin movimientos, hayMovimientos es falso", () => {
    const estado = cuantoSobraEnElMes({ renglones: [], income: "0", expense: "0" });
    expect(estado.hayMovimientos).toBe(false);
  });

  it("un target de 0 ('0.0000', 'este mes no aplica') suma 0: deja de contarse en el previsto", () => {
    // El dueño no paga agua este mes: el tope queda en 0 y aporta 0 a la
    // suma — igual que un renglón sin fila. Y NO es target null: el mes
    // sigue presupuestado (hayGastos cuenta el tope en cero).
    const conAgua = cuantoSobraEnElMes({
      renglones: [ingreso("3000000"), gasto("800000"), gasto("2000000")],
      income: "3000000",
      expense: "800000",
    });
    expect(conAgua.previsto).toBe("200000.0000");

    const conAguaEnCero = cuantoSobraEnElMes({
      renglones: [ingreso("3000000"), gasto("0.0000"), gasto("2000000")],
      income: "3000000",
      expense: "800000",
    });

    expect(conAguaEnCero.previsto).toBe("1000000.0000");
    expect(conAguaEnCero.previstoUnidades).toBe(aUnidadesMinimas("1000000"));
    expect(conAguaEnCero.hayIngresos).toBe(true);
    expect(conAguaEnCero.hayGastos).toBe(true);
  });

  it("todos los renglones en cero: previsto 0 sin NaN, y las palabras del sentido no cambian", () => {
    const estado = cuantoSobraEnElMes({
      renglones: [ingreso("0.0000"), gasto("0.0000"), ahorro("0.0000")],
      income: "0",
      expense: "0",
    });

    expect(estado.previsto).toBe("0.0000");
    expect(estado.previstoUnidades).toBe(0n);
    // Ambos lados existen (con montos fijados, aunque sean 0): el cuadrito
    // dice "Ni te sobra ni te falta según lo previsto", no "Presupuesta…".
    expect(estado.hayIngresos).toBe(true);
    expect(estado.hayGastos).toBe(true);
  });
});

/**
 * Los totales por sección que el panel muestra en sus encabezados son la MISMA
 * cuenta que el previsto: estas pruebas fijan que `cuantoSobraEnElMes` no
 * vuelva a duplicar la lógica y que los casos de dinero exacto (0.1 + 0.2,
 * todo en cero) se comporten igual en los totales sueltos.
 */
describe("totalesPrevistos", () => {
  it("suma ingresos y gastos por separado con varios renglones de cada lado", () => {
    const totales = totalesPrevistos([
      ingreso("3000000"),
      ingreso("500000"),
      gasto("2000000"),
      gasto("250000"),
    ]);

    expect(totales.ingresos).toBe("3500000.0000");
    expect(totales.gastos).toBe("2250000.0000");
    expect(totales.hayIngresos).toBe(true);
    expect(totales.hayGastos).toBe(true);
  });

  it("el ahorro no entra en ninguno de los dos totales (decisión del dueño)", () => {
    const totales = totalesPrevistos([ingreso("1000000"), gasto("300000"), ahorro("999999")]);

    expect(totales.ingresos).toBe("1000000.0000");
    expect(totales.gastos).toBe("300000.0000");
  });

  it("un renglón sin monto en el mes (target null) no suma y no inventa el lado", () => {
    const totales = totalesPrevistos([
      { kind: "category", categoryKind: "income", target: null },
      { kind: "category", categoryKind: "expense", target: null },
    ]);

    expect(totales.ingresos).toBe("0.0000");
    expect(totales.gastos).toBe("0.0000");
    // Sin renglón con monto, el panel no debe mostrar un total inventado.
    expect(totales.hayIngresos).toBe(false);
    expect(totales.hayGastos).toBe(false);
  });

  it("un target de cero ('0.0000', este mes no aplica) suma 0, pero el lado existe", () => {
    const totales = totalesPrevistos([ingreso("0.0000"), gasto("0.0000")]);

    expect(totales.ingresos).toBe("0.0000");
    expect(totales.gastos).toBe("0.0000");
    // El lado existe con monto fijado (aunque sume 0): el panel muestra "$0".
    expect(totales.hayIngresos).toBe(true);
    expect(totales.hayGastos).toBe(true);
  });

  it("0.1 + 0.2 da exactamente 0.3, no la aproximación del flotante", () => {
    const totales = totalesPrevistos([gasto("0.1"), gasto("0.2"), ingreso("0.3")]);

    expect(totales.gastos).toBe("0.3000");
    expect(totales.ingresos).toBe("0.3000");
    // La resta de los totales queda en CERO exacto, sin polvo de flotante.
    expect(aUnidadesMinimas(totales.ingresos) - aUnidadesMinimas(totales.gastos)).toBe(0n);
  });

  it("todo en cero no produce NaN en ninguno de los totales", () => {
    const totales = totalesPrevistos([ingreso("0.0000"), gasto("0.0000"), ahorro("0.0000")]);

    expect(totales.ingresos).toBe("0.0000");
    expect(totales.gastos).toBe("0.0000");
    expect(totales.ingresos).not.toContain("NaN");
    expect(totales.gastos).not.toContain("NaN");
  });

  it("un renglón sin tipo de categoría (defensivo) queda fuera de los dos totales", () => {
    const totales = totalesPrevistos([
      { kind: "category", categoryKind: null, target: "5000" },
      gasto("1000"),
    ]);

    expect(totales.gastos).toBe("1000.0000");
    expect(totales.ingresos).toBe("0.0000");
  });

  it("coincide con el previsto de cuantoSobraEnElMes: ingresos − gastos", () => {
    const renglones = [ingreso("3000000"), ingreso("500000"), gasto("1200000"), gasto("300000")];
    const totales = totalesPrevistos(renglones);
    const estado = cuantoSobraEnElMes({ renglones, income: "0", expense: "0" });

    // La resta de los dos totales del panel es, exactamente, el previsto del
    // cuadrito: una sola fuente, no pueden diferir.
    expect(aUnidadesMinimas(totales.ingresos) - aUnidadesMinimas(totales.gastos)).toBe(
      estado.previstoUnidades
    );
  });
});
