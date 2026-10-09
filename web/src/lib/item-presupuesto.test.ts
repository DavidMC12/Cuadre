import { describe, expect, it } from "vitest";

import { agruparItemsDePago, SIN_ITEM, textoDeOpcion } from "./item-presupuesto";
import type { ItemDelChecklist } from "./api/types";

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

describe("textoDeOpcion", () => {
  it("dice lo que falta con aritmética exacta y formato exacto", () => {
    // 250.000 − 147.500 = 102.500, texto exacto.
    expect(
      textoDeOpcion(renglon({ id: "i", target: "250000", progress: "147500" }))
    ).toBe("Deuda TC Nu — faltan $102.500");
  });

  it("con el objetivo alcanzado dice pagado en un tope de gasto", () => {
    expect(
      textoDeOpcion(renglon({ id: "i", target: "1000", progress: "1000", status: "paid" }))
    ).toBe("Deuda TC Nu — pagado");
  });

  it("pasarse del objetivo también califica como pagado (mínimo 0 en el faltante)", () => {
    expect(
      textoDeOpcion(renglon({ id: "i", target: "1000", progress: "1500", status: "exceeded" }))
    ).toBe("Deuda TC Nu — pagado");
  });

  it("en un ingreso, el cumplido dice recibido", () => {
    expect(
      textoDeOpcion(
        renglon({
          id: "i",
          categoryId: "c-sue",
          categoryKind: "income",
          target: "1000",
          progress: "1000",
          status: "paid",
        })
      )
    ).toBe("Deuda TC Nu — recibido");
  });

  it("sin objetivo ese mes queda solo el nombre", () => {
    expect(textoDeOpcion(renglon({ id: "i", target: null }))).toBe("Deuda TC Nu");
  });

  it("con objetivo en cero (este mes no aplica) queda solo el nombre", () => {
    // "0.0000" es truthy: el cero se lee con esCero, nunca con la
    // verdad/falsedad del string.
    expect(textoDeOpcion(renglon({ id: "i", target: "0.0000" }))).toBe("Deuda TC Nu");
  });
});

describe("agruparItemsDePago", () => {
  it("junta los ítems de gasto por categoría en orden alfabético", () => {
    const grupos = agruparItemsDePago([
      renglon({ id: "i-t1", categoryId: "c-trans", categoryName: "Transporte" }),
      renglon({ id: "i-d1", categoryId: "c-deu", categoryName: "Deudas" }),
      renglon({ id: "i-d2", categoryId: "c-deu", categoryName: "Deudas" }),
    ]);

    expect(grupos.map((g) => g.categoryName)).toEqual(["Deudas", "Transporte"]);
    expect(grupos[0]!.items.map((r) => r.id)).toEqual(["i-d1", "i-d2"]);
  });

  it("los ítems de ingreso y los sin categoría no son opciones de pago", () => {
    const grupos = agruparItemsDePago([
      renglon({
        id: "i-sue",
        categoryId: "c-sue",
        categoryKind: "income",
        categoryName: "Sueldo",
      }),
      renglon({ id: "i-ns", categoryId: null }),
      renglon({ id: "i-d1", categoryId: "c-deu", categoryName: "Deudas" }),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.items.map((r) => r.id)).toEqual(["i-d1"]);
  });

  it("una categoría cuyo nombre no llegó lleva un título neutro", () => {
    const grupos = agruparItemsDePago([
      renglon({ id: "i-d1", categoryId: "c-deu", categoryName: null }),
    ]);

    expect(grupos[0]!.categoryName).toBe("Categoría");
  });
});

describe("SIN_ITEM", () => {
  it("no es un valor vacío (el Select no lo acepta) ni colisiona con ids reales", () => {
    expect(SIN_ITEM).not.toBe("");
    expect(SIN_ITEM).toMatch(/^__/);
  });
});
