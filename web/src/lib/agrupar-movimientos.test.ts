import { describe, expect, it } from "vitest";
import { agruparMovimientosPorDia } from "./agrupar-movimientos";
import type { Movimiento } from "./api/types";

function movimiento(
  datos: Partial<Movimiento> & Pick<Movimiento, "id" | "occurredAt">
): Movimiento {
  return {
    accountId: "cuenta-1",
    categoryId: null,
    kind: "standard",
    amount: "-1000.0000",
    currency: "COP",
    description: null,
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
    ...datos,
  };
}

describe("agruparMovimientosPorDia", () => {
  it("agrupa movimientos normales por su día, en el orden recibido", () => {
    const hoy = new Date().toISOString();
    const t1 = movimiento({ id: "t1", occurredAt: hoy });
    const t2 = movimiento({ id: "t2", occurredAt: hoy });
    const grupos = agruparMovimientosPorDia([t1, t2]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].items.map((m) => m.id)).toEqual(["t1", "t2"]);
  });

  it("suma el saldo inicial al grupo de su propio día aunque ya no sea el último", () => {
    // Reproduce el caso real: la cuenta se creó hoy (el saldo inicial queda
    // fechado hoy), pero además hay un movimiento de hoy mismo Y uno viejo de
    // otro día en medio. Antes de este arreglo, esto abría un segundo grupo
    // "Hoy" al final —dos grupos con la misma etiqueta, y la misma `key` de
    // React para los dos—.
    const hoy = new Date().toISOString();
    const viejo = "2020-03-03T12:00:00.000Z";

    const t1 = movimiento({ id: "t1", occurredAt: hoy, kind: "standard" });
    const apertura = movimiento({ id: "apertura", occurredAt: hoy, kind: "opening" });
    const t2 = movimiento({ id: "t2", occurredAt: viejo, kind: "standard" });

    const grupos = agruparMovimientosPorDia([t1, apertura, t2]);

    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.etiqueta)).toEqual([...new Set(grupos.map((g) => g.etiqueta))]);
    expect(grupos[0].items.map((m) => m.id)).toEqual(["t1", "apertura"]);
    expect(grupos[1].items.map((m) => m.id)).toEqual(["t2"]);
  });

  it("el saldo inicial abre su propio grupo al final si su día no aparece en ningún otro lado", () => {
    const reciente = new Date().toISOString();
    const aperturaVieja = "2020-03-03T12:00:00.000Z";

    const t1 = movimiento({ id: "t1", occurredAt: reciente, kind: "standard" });
    const apertura = movimiento({ id: "apertura", occurredAt: aperturaVieja, kind: "opening" });

    const grupos = agruparMovimientosPorDia([t1, apertura]);

    expect(grupos).toHaveLength(2);
    expect(grupos[1].items.map((m) => m.id)).toEqual(["apertura"]);
  });
});
