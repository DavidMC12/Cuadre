import { describe, expect, it } from "vitest";

import type { ItemDelChecklist } from "@/lib/api/types";
import {
  PREFIJO_CATEGORIA,
  PREFIJO_ITEM,
  PREFIJO_OTRO,
  SIN_CATEGORIA_EN_QUE_FUE,
  leerEleccion,
  opcionesDeEnQueFue,
  textoCerradoDeEnQueFue,
} from "./desplegable-en-que-fue";

function itemChecklist(over: Partial<ItemDelChecklist> & { id: string }): ItemDelChecklist {
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

const CATEGORIAS = [
  { id: "c-str", name: "Transporte", kind: "expense", archivedAt: null },
  { id: "c-deu", name: "Deudas", kind: "expense", archivedAt: null },
  { id: "c-mer", name: "Mercado", kind: "expense", archivedAt: null },
  { id: "c-vieja", name: "Vieja", kind: "expense", archivedAt: "2026-01-01T00:00:00Z" },
  { id: "c-sue", name: "Sueldo", kind: "income", archivedAt: null },
] as const;

const items: ItemDelChecklist[] = [
  itemChecklist({ id: "i-dav", label: "Deuda Davivienda", target: "267530" }),
  itemChecklist({ id: "i-nu", target: "250000", progress: "147500" }),
  // Asegura el orden: compras venía antes en el checklist, Deudas después.
  itemChecklist({
    id: "i-mer",
    label: "Compra semanal",
    categoryId: "c-mer",
    categoryName: "Mercado",
    target: "60000",
  }),
];

describe("opcionesDeEnQueFue", () => {
  it("arma la primera opción 'Sin categoría' sin grupo y grupos por categoría con items", () => {
    const grupos = opcionesDeEnQueFue({ categorias: [...CATEGORIAS], items, tipo: "expense" });

    const titulos = grupos.map((grupo) => grupo.etiqueta);
    expect(titulos).toEqual([null, "Deudas", "Mercado", "Otras categorías"]);
    expect(grupos[0].opciones).toEqual([
      { value: SIN_CATEGORIA_EN_QUE_FUE, texto: "Sin categoría" },
    ]);
    expect(grupos[1].opciones.map((opcion) => opcion.texto)).toEqual([
      "Deuda Davivienda — faltan $267.530",
      "Deuda TC Nu — faltan $102.500",
      "Otro de Deudas",
    ]);
  });

  it("los items de un grupo conservan el orden del checklist, aunque el grupo venga alfabético", () => {
    const grupos = opcionesDeEnQueFue({ categorias: [...CATEGORIAS], items, tipo: "expense" });
    const deudas = grupos.find((grupo) => grupo.etiqueta === "Deudas");
    expect(deudas?.opciones.map((opcion) => opcion.value)).toEqual([
      `${PREFIJO_ITEM}i-dav`,
      `${PREFIJO_ITEM}i-nu`,
      `${PREFIJO_OTRO}c-deu`,
    ]);
  });

  it("las categorías sin items van bajo 'Otras categorías' y así eligen solo la categoría", () => {
    const grupos = opcionesDeEnQueFue({ categorias: [...CATEGORIAS], items, tipo: "expense" });
    const otras = grupos.find((grupo) => grupo.etiqueta === "Otras categorías");
    expect(otras?.opciones).toEqual([
      { value: `${PREFIJO_CATEGORIA}c-str`, texto: "Transporte" },
    ]);
  });

  it("una categoría archivada nunca aparece ni como grupo ni como opción", () => {
    const grupos = opcionesDeEnQueFue({ categorias: [...CATEGORIAS], items, tipo: "expense" });
    const textos = grupos.flatMap((grupo) => grupo.opciones.map((opcion) => opcion.texto));
    expect(textos).not.toContain("Vieja");
  });

  it("un ingreso ve las categorías de ingreso y sus items, no los de gasto", () => {
    const ingresos = opcionesDeEnQueFue({
      categorias: [...CATEGORIAS],
      items: [
        itemChecklist({
          id: "i-sue",
          label: "Sueldo septiembre",
          categoryId: "c-sue",
          categoryKind: "income",
          categoryName: "Sueldo",
          progress: "1200000",
          status: "paid",
        }),
        items[0],
      ],
      tipo: "income",
    });

    expect(ingresos.map((grupo) => grupo.etiqueta)).toEqual([null, "Sueldo"]);
    expect(ingresos[1].opciones.map((opcion) => opcion.texto)).toEqual([
      "Sueldo septiembre — recibido",
      "Otro de Sueldo",
    ]);
  });

  it("los items de ahorro (kind savings) nunca aparecen", () => {
    const grupos = opcionesDeEnQueFue({
      categorias: [...CATEGORIAS],
      items: [
        itemChecklist({ id: "i-aho", kind: "savings", categoryId: null, categoryName: null, categoryKind: null }),
        items[1],
      ],
      tipo: "expense",
    });
    expect(grupos.map((grupo) => grupo.etiqueta)).toEqual([null, "Deudas", "Otras categorías"]);
    // El renglón de ahorro no está en ninguna parte.
    expect(grupos.flatMap((g) => g.opciones.map((o) => o.value))).not.toContain("i-aho");
  });

  it("sin checklist (aún sin presupuesto) queda solo 'Sin categoría' y 'Otras categorías'", () => {
    const grupos = opcionesDeEnQueFue({ categorias: [...CATEGORIAS], items: [], tipo: "expense" });
    expect(grupos.map((grupo) => grupo.etiqueta)).toEqual([null, "Otras categorías"]);
    expect(grupos[1].opciones).toEqual([
      { value: `${PREFIJO_CATEGORIA}c-deu`, texto: "Deudas" },
      { value: `${PREFIJO_CATEGORIA}c-mer`, texto: "Mercado" },
      { value: `${PREFIJO_CATEGORIA}c-str`, texto: "Transporte" },
    ]);
  });

  it("un item de una categoría archivada no entra: no se ofrece bajo la categoría muerta", () => {
    const grupos = opcionesDeEnQueFue({
      categorias: [...CATEGORIAS],
      items: [itemChecklist({ id: "i-viejo", categoryId: "c-vieja", categoryName: "Vieja" })],
      tipo: "expense",
    });
    expect(grupos.map((grupo) => grupo.etiqueta)).toEqual([null, "Otras categorías"]);
  });
});

describe("leerEleccion", () => {
  it("descifra los tres prefijos y devuelve null en 'Sin categoría'", () => {
    expect(leerEleccion(`${PREFIJO_ITEM}i-nu`)).toEqual({ tipo: "item", id: "i-nu" });
    expect(leerEleccion(`${PREFIJO_OTRO}c-deu`)).toEqual({ tipo: "otro", id: "c-deu" });
    expect(leerEleccion(`${PREFIJO_CATEGORIA}c-str`)).toEqual({ tipo: "categoria", id: "c-str" });
    expect(leerEleccion(SIN_CATEGORIA_EN_QUE_FUE)).toBeNull();
  });
});

describe("textoCerradoDeEnQueFue", () => {
  it("con item elegido muestra '<Categoría> - <nombre>', sin el 'faltan'", () => {
    const texto = textoCerradoDeEnQueFue({
      categoriaId: "c-deu",
      itemId: "i-nu",
      items,
      categorias: [...CATEGORIAS],
    });
    expect(texto).toBe("Deudas - Deuda TC Nu");
  });

  it("categoría con items sin item elegido (u 'Otro de ...') muestra '<Categoría> (sin item)'", () => {
    const texto = textoCerradoDeEnQueFue({
      categoriaId: "c-deu",
      itemId: null,
      items,
      categorias: [...CATEGORIAS],
    });
    expect(texto).toBe("Deudas (sin item)");
  });

  it("categoría sin items muestra su nombre; nada elegido muestra 'Sin categoría'", () => {
    expect(
      textoCerradoDeEnQueFue({ categoriaId: "c-str", itemId: null, items, categorias: [...CATEGORIAS] })
    ).toBe("Transporte");
    expect(
      textoCerradoDeEnQueFue({ categoriaId: null, itemId: null, items, categorias: [...CATEGORIAS] })
    ).toBe("Sin categoría");
  });

  it("si el item elegido ya no se ofrece no se inventa texto: cae al '(sin item)' de su categoría", () => {
    const texto = textoCerradoDeEnQueFue({
      categoriaId: "c-deu",
      itemId: "i-desaparecido",
      items,
      categorias: [...CATEGORIAS],
    });
    expect(texto).toBe("Deudas (sin item)");
  });
});
