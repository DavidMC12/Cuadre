import { describe, expect, it } from "vitest";

import { agruparPresupuesto, CLAVE_AHORRO, CLAVE_SIN_CATEGORIA } from "./agrupar-presupuesto";
import type { ItemDelChecklist, ItemPresupuesto } from "./api/types";

function renglon(id: string, kind: ItemDelChecklist["kind"] = "category"): ItemDelChecklist {
  return {
    id,
    kind,
    currency: "COP",
    label: id,
    target: "100",
    progress: "50",
    checked: false,
    exceeded: false,
  };
}

function item(over: Partial<ItemPresupuesto> & { id: string }): ItemPresupuesto {
  return {
    kind: "category",
    currency: "COP",
    categoryId: null,
    categoryName: null,
    accountId: null,
    accountName: null,
    label: null,
    currentAmount: "1000",
    archivedAt: null,
    ...over,
  };
}

function mapa(items: ItemPresupuesto[]): Map<string, ItemPresupuesto> {
  return new Map(items.map((i) => [i.id, i]));
}

describe("agruparPresupuesto", () => {
  it("ordena del grupo con más ítems al de menos y desempata alfabéticamente", () => {
    const items = [
      item({ id: "c1", categoryId: "comida", categoryName: "Comida" }),
      item({ id: "c2", categoryId: "comida", categoryName: "Comida" }),
      item({ id: "t1", categoryId: "transporte", categoryName: "Transporte" }),
      item({ id: "o1", categoryId: "ocio", categoryName: "Ocio" }),
    ];
    // Transporte y Ocio empatan en 1: manda el nombre.
    const grupos = agruparPresupuesto(
      [renglon("c1"), renglon("c2"), renglon("t1"), renglon("o1")],
      mapa(items)
    );

    expect(grupos.map((g) => g.titulo)).toEqual(["Comida", "Ocio", "Transporte"]);
  });

  it("cierra con Ahorro, aunque sea el grupo más grande", () => {
    const items = [
      item({ id: "c1", categoryId: "comida", categoryName: "Comida" }),
      item({ id: "a1", kind: "savings", accountName: "Viaje" }),
      item({ id: "a2", kind: "savings", accountName: "Carro" }),
      item({ id: "a3", kind: "savings", accountName: "Casa" }),
    ];
    const grupos = agruparPresupuesto(
      [renglon("c1"), renglon("a1", "savings"), renglon("a2", "savings"), renglon("a3", "savings")],
      mapa(items)
    );

    expect(grupos.map((g) => g.titulo)).toEqual(["Comida", "Ahorro"]);
    expect(grupos.at(-1)?.clave).toBe(CLAVE_AHORRO);
  });

  it("deja 'Sin categoría' después de las categorías reales", () => {
    const items = [item({ id: "s1" }), item({ id: "c1", categoryId: "comida", categoryName: "Comida" })];
    const grupos = agruparPresupuesto([renglon("s1"), renglon("c1")], mapa(items));

    expect(grupos.map((g) => g.clave)).toEqual(["comida", CLAVE_SIN_CATEGORIA]);
    expect(grupos[0].titulo).toBe("Comida");
    expect(grupos[1].titulo).toBe("Sin categoría");
  });

  it("si hay categoría pero falta su nombre, usa la etiqueta del ítem en vez de mentir con 'Sin categoría'", () => {
    const items = [item({ id: "c1", categoryId: "comida", label: "Mercado del mes" })];
    const grupos = agruparPresupuesto([renglon("c1")], mapa(items));

    expect(grupos).toHaveLength(1);
    expect(grupos[0].clave).toBe("comida");
    expect(grupos[0].titulo).toBe("Mercado del mes");
    expect(grupos[0].categoryId).toBe("comida");
  });
});
