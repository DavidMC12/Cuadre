import { describe, expect, it } from "vitest";

import { fechaCorta, itemsDeLaCategoria, movimientosSinAsignar } from "./sin-asignar";
import type { ItemDelChecklist, Movimiento } from "./api/types";

function movimiento(over: Partial<Movimiento> & { id: string }): Movimiento {
  return {
    accountId: "a-1",
    categoryId: "c-deu",
    budgetItemId: null,
    paymentGroupId: null,
    kind: "standard",
    amount: "-12500",
    currency: "COP",
    occurredAt: "2026-09-10T12:00:00Z",
    description: "Cuota",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
    ...over,
  };
}

const OPCIONES = { categoryId: "c-deu", moneda: "COP" };

describe("movimientosSinAsignar: solo lo que de verdad quedó sin repartir", () => {
  it("deja pasar un gasto normal, de la categoría y moneda, sin ítem", () => {
    const uno = movimiento({ id: "m-1" });
    expect(movimientosSinAsignar([uno], OPCIONES)).toEqual([uno]);
  });

  it("deja fuera lo ya asignado a un ítem", () => {
    const asignado = movimiento({ id: "m-1", budgetItemId: "i-1" });
    expect(movimientosSinAsignar([asignado], OPCIONES)).toEqual([]);
  });

  it("deja fuera al anulado (lo anuló otro) y a la anulación (anula a otro)", () => {
    const anulado = movimiento({ id: "m-1", reversedByTransactionId: "m-2" });
    const anulacion = movimiento({ id: "m-2", reversesTransactionId: "m-1" });
    expect(movimientosSinAsignar([anulado, anulacion], OPCIONES)).toEqual([]);
  });

  it("deja fuera a la transferencia, al saldo inicial y al ajuste", () => {
    const movimientos = [
      movimiento({ id: "m-1", kind: "transfer", categoryId: null, transferGroupId: "g-1" }),
      movimiento({ id: "m-2", kind: "opening", categoryId: null }),
      movimiento({ id: "m-3", kind: "adjustment", categoryId: null }),
    ];
    expect(movimientosSinAsignar(movimientos, OPCIONES)).toEqual([]);
  });

  it("deja fuera la otra moneda y la otra categoría", () => {
    const otraMoneda = movimiento({ id: "m-1", currency: "USD" });
    const otraCategoria = movimiento({ id: "m-2", categoryId: "c-otra" });
    expect(movimientosSinAsignar([otraMoneda, otraCategoria], OPCIONES)).toEqual([]);
  });

  it("ordena lo más reciente primero", () => {
    const viejo = movimiento({ id: "m-viejo", occurredAt: "2026-09-02T12:00:00Z" });
    const nuevo = movimiento({ id: "m-nuevo", occurredAt: "2026-09-25T12:00:00Z" });
    const medio = movimiento({ id: "m-medio", occurredAt: "2026-09-10T12:00:00Z" });
    expect(
      movimientosSinAsignar([viejo, nuevo, medio], OPCIONES).map((m) => m.id)
    ).toEqual(["m-nuevo", "m-medio", "m-viejo"]);
  });

  it("no muta el arreglo que recibe", () => {
    const original = [
      movimiento({ id: "m-viejo", occurredAt: "2026-09-02T12:00:00Z" }),
      movimiento({ id: "m-nuevo", occurredAt: "2026-09-25T12:00:00Z" }),
    ];
    movimientosSinAsignar(original, OPCIONES);
    expect(original.map((m) => m.id)).toEqual(["m-viejo", "m-nuevo"]);
  });
});

describe("itemsDeLaCategoria: la lista del desplegable", () => {
  function renglon(over: Partial<ItemDelChecklist> & { id: string }): ItemDelChecklist {
    return {
      kind: "category",
      currency: "COP",
      label: "Deuda TC Nu",
      categoryKind: "expense",
      categoryId: "c-deu",
      categoryName: "Deudas",
      target: "250000",
      progress: "0",
      checked: false,
      exceeded: false,
      status: "pending",
      ...over,
    };
  }

  it("solo trae los ítems de esa categoría", () => {
    const items = [
      renglon({ id: "i-1" }),
      renglon({ id: "i-2", categoryId: "c-otra" }),
      renglon({ id: "a-1", kind: "savings", categoryId: null, categoryKind: null }),
      renglon({ id: "i-3" }),
    ];
    expect(itemsDeLaCategoria(items, "c-deu").map((r) => r.id)).toEqual(["i-1", "i-3"]);
  });
});

describe("fechaCorta", () => {
  it("corta al día y el mes, en hora de Bogotá", () => {
    // 02:00 UTC del 5 de octubre ya es el 4 en Bogotá (UTC-5).
    expect(fechaCorta("2026-10-05T02:00:00Z")).toBe("4 oct");
    expect(fechaCorta("2026-09-10T12:00:00Z")).toBe("10 sept");
  });
});
