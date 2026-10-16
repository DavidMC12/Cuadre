import { describe, expect, it } from "vitest";

import {
  type CatalogoDeItems,
  resolverCatalogoDeItems,
  segmentosDeItemEnLaFila,
} from "./item-en-la-fila";
import type { ItemPresupuesto, Movimiento } from "./api/types";

function item(over: Partial<ItemPresupuesto> & { id: string }): ItemPresupuesto {
  return {
    kind: "category",
    currency: "COP",
    categoryId: "c-deu",
    categoryName: "Deudas",
    categoryKind: "expense",
    accountId: null,
    accountName: null,
    label: "Deuda TC Nu",
    currentAmount: "250000",
    archivedAt: null,
    ...over,
  };
}

function movimiento(over: Partial<Movimiento> = {}): Movimiento {
  return {
    id: "m-1",
    accountId: "a-1",
    categoryId: "c-deu",
    budgetItemId: null,
    kind: "standard",
    amount: "-12500",
    currency: "COP",
    occurredAt: "2026-09-10T12:00:00Z",
    description: "Cuota",
    transferGroupId: null,
    paymentGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
    ...over,
  };
}

/** El catálogo de siempre: la categoría Deudas con el ítem "Deuda TC Nu". */
function catalogo(items: ItemPresupuesto[] = [item({ id: "i-nu" })]): CatalogoDeItems {
  return resolverCatalogoDeItems(items)!;
}

function segmentos(movimientoDado: Movimiento, categoria: string | undefined = "Deudas") {
  return segmentosDeItemEnLaFila({ movimiento: movimientoDado, categoria, catalogo: catalogo() });
}

describe("resolverCatalogoDeItems", () => {
  it("sin datos (cargando o falló) devuelve null", () => {
    expect(resolverCatalogoDeItems(undefined)).toBeNull();
  });

  it("no cuenta un ítem de ahorro (sin categoría) como categoría con ítems", () => {
    const resuelto = resolverCatalogoDeItems([
      item({
        id: "a-1",
        kind: "savings",
        categoryId: null,
        categoryName: null,
        accountName: "Meta de ahorro",
      }),
    ])!;
    expect(resuelto.itemsPorCategoria.size).toBe(0);
  });

  it("resuelve el nombre con label, categoryName o accountName", () => {
    const resuelto = resolverCatalogoDeItems([
      item({ id: "i-1" }),
      item({ id: "i-2", label: null, categoryName: "Deudas" }),
      item({ id: "i-3", label: null, categoryName: null, accountName: "Meta de ahorro" }),
    ])!;
    expect(resuelto.nombrePorItem.get("i-1")).toBe("Deuda TC Nu");
    expect(resuelto.nombrePorItem.get("i-2")).toBe("Deudas");
    expect(resuelto.nombrePorItem.get("i-3")).toBe("Meta de ahorro");
  });
});

describe("segmentosDeItemEnLaFila: con ítem asignado", () => {
  it("muestra 'Categoria - Item' con el mismo formato del desplegable", () => {
    expect(segmentos(movimiento({ budgetItemId: "i-nu" }))).toEqual(["Deudas - Deuda TC Nu"]);
  });

  it("si el ítem se llama como la categoría, lo muestra UNA sola vez (sin mayúsculas ni espacios)", () => {
    const conMismoNombre = catalogo([item({ id: "i-x", label: "  DEUDAS " })]);
    expect(
      segmentosDeItemEnLaFila({
        movimiento: movimiento({ budgetItemId: "i-x" }),
        categoria: "Deudas",
        catalogo: conMismoNombre,
      })
    ).toEqual(["Deudas"]);
  });

  it("sin categoría, muestra solo el ítem", () => {
    expect(
      segmentosDeItemEnLaFila({
        movimiento: movimiento({ budgetItemId: "i-nu", categoryId: null }),
        categoria: undefined,
        catalogo: catalogo(),
      })
    ).toEqual(["Deuda TC Nu"]);
  });

  it("un ítem que el catálogo no conoce no inventa un nombre: queda como hoy", () => {
    expect(segmentos(movimiento({ budgetItemId: "i-desaparecido" }))).toEqual(["Deudas"]);
  });
});

describe("segmentosDeItemEnLaFila: sin ítem", () => {
  it("marca 'Sin asignar' si su categoría tiene ítems", () => {
    expect(segmentos(movimiento())).toEqual(["Deudas", "Sin asignar"]);
  });

  it("si su categoría no tiene ítems, queda como hoy (solo la categoría)", () => {
    expect(
      segmentosDeItemEnLaFila({
        movimiento: movimiento({ categoryId: "c-otra" }),
        categoria: "Otra",
        catalogo: catalogo(),
      })
    ).toEqual(["Otra"]);
  });

  it("sin categoría no marca nada", () => {
    expect(
      segmentosDeItemEnLaFila({
        movimiento: movimiento({ categoryId: null }),
        categoria: undefined,
        catalogo: catalogo(),
      })
    ).toEqual([]);
  });

  it("la categoría con ítems de OTRA moneda no cuenta", () => {
    const enDolares = catalogo([item({ id: "i-usd", currency: "USD" })]);
    expect(
      segmentosDeItemEnLaFila({
        movimiento: movimiento(),
        categoria: "Deudas",
        catalogo: enDolares,
      })
    ).toEqual(["Deudas"]);
  });
});

describe("segmentosDeItemEnLaFila: nunca 'Sin asignar'", () => {
  it("saldo inicial (opening) y ajuste (adjustment)", () => {
    expect(segmentos(movimiento({ kind: "opening" }))).toEqual(["Deudas"]);
    expect(segmentos(movimiento({ kind: "adjustment" }))).toEqual(["Deudas"]);
  });

  it("movimiento anulado y la anulación misma", () => {
    expect(segmentos(movimiento({ reversedByTransactionId: "m-2" }))).toEqual(["Deudas"]);
    expect(segmentos(movimiento({ reversesTransactionId: "m-1" }))).toEqual(["Deudas"]);
  });

  it("una transferencia sin ítem no agrega nada; con ítem muestra el ítem", () => {
    const sinItem = movimiento({ kind: "transfer", categoryId: null, transferGroupId: "tg-1" });
    expect(
      segmentosDeItemEnLaFila({ movimiento: sinItem, categoria: undefined, catalogo: catalogo() })
    ).toEqual([]);

    const conItem = movimiento({
      kind: "transfer",
      categoryId: null,
      budgetItemId: "i-nu",
      transferGroupId: "tg-1",
    });
    expect(
      segmentosDeItemEnLaFila({ movimiento: conItem, categoria: undefined, catalogo: catalogo() })
    ).toEqual(["Deuda TC Nu"]);
  });
});

describe("segmentosDeItemEnLaFila: el catálogo y el mes", () => {
  it("sin catálogo (cargando o falló) queda como hoy, aunque haya ítem", () => {
    expect(
      segmentosDeItemEnLaFila({
        movimiento: movimiento({ budgetItemId: "i-nu" }),
        categoria: "Deudas",
        catalogo: null,
      })
    ).toEqual(["Deudas"]);
    expect(
      segmentosDeItemEnLaFila({
        movimiento: movimiento(),
        categoria: "Deudas",
        catalogo: null,
      })
    ).toEqual(["Deudas"]);
  });

  it("un ítem archivado ANTES del mes del movimiento ya no cuenta", () => {
    const archivadoEnAgosto = catalogo([
      item({ id: "i-nu", archivedAt: "2026-08-15T12:00:00Z" }),
    ]);
    // Movimiento de septiembre.
    expect(
      segmentosDeItemEnLaFila({
        movimiento: movimiento(),
        categoria: "Deudas",
        catalogo: archivadoEnAgosto,
      })
    ).toEqual(["Deudas"]);
  });

  it("un ítem archivado el mismo mes (o después) sí cuenta", () => {
    const archivadoEnSeptiembre = catalogo([
      item({ id: "i-nu", archivedAt: "2026-09-20T12:00:00Z" }),
    ]);
    expect(
      segmentosDeItemEnLaFila({
        movimiento: movimiento(),
        categoria: "Deudas",
        catalogo: archivadoEnSeptiembre,
      })
    ).toEqual(["Deudas", "Sin asignar"]);
  });

  it("el mes se corta en hora de Bogotá: un movimiento de fin de mes no salta de mes", () => {
    // 01:00 UTC del 1 de octubre ya es el 30 de septiembre en Bogotá (UTC-5):
    // el movimiento y el archivo (15 de septiembre) son del MISMO mes; leído
    // en UTC, el movimiento caería en octubre y el archivo ya no contaría.
    const itemArchivadoEnSeptiembre = catalogo([
      item({ id: "i-nu", archivedAt: "2026-09-15T12:00:00Z" }),
    ]);
    expect(
      segmentosDeItemEnLaFila({
        movimiento: movimiento({ occurredAt: "2026-10-01T01:00:00Z" }),
        categoria: "Deudas",
        catalogo: itemArchivadoEnSeptiembre,
      })
    ).toEqual(["Deudas", "Sin asignar"]);
  });
});
