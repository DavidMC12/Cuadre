import { describe, expect, it } from "vitest";

import {
  COLOR_NEUTRO,
  mapaColoresCategorias,
  mapaColoresCategoriasDelCatalogo,
} from "./chart-colors";
import type { Categoria } from "./api/types";

const EXPENSE_1 = "#2a78d6";
const EXPENSE_2 = "#eb6834";
const EXPENSE_3 = "#1baf7a";

const CATALOGO: Categoria[] = [
  { id: "b", name: "Zanahoria", kind: "expense", archivedAt: null },
  { id: "a", name: "Arroz", kind: "expense", archivedAt: null },
  { id: "c", name: "Mango", kind: "income", archivedAt: null },
  // Archivada: igual cuenta para el índice, para no correr los colores.
  { id: "d", name: "Banano", kind: "expense", archivedAt: "2024-01-01" },
];

describe("mapaColoresCategoriasDelCatalogo", () => {
  it("reparte la paleta por nombre alfabético y omite el otro tipo", () => {
    const mapa = mapaColoresCategoriasDelCatalogo(CATALOGO, "expense", "claro");

    // Orden alfabético: Arroz, Banano, Zanahoria.
    expect(mapa.get("a")).toBe(EXPENSE_1);
    expect(mapa.get("d")).toBe(EXPENSE_2);
    expect(mapa.get("b")).toBe(EXPENSE_3);
    // La categoría de ingreso no entra en el mapa de gasto.
    expect(mapa.has("c")).toBe(false);
  });

  it("da exactamente el mismo mapa que armaba cada gráfica por su cuenta", () => {
    // La lógica vieja, palabra por palabra: filtro por tipo, orden por nombre,
    // reparto de la paleta. El helper la reemplaza sin cambiar un color.
    const viejo = (kind: "expense" | "income", modo: "claro" | "oscuro") =>
      mapaColoresCategorias(
        CATALOGO.filter((categoria) => categoria.kind === kind)
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name)),
        modo
      );

    for (const modo of ["claro", "oscuro"] as const) {
      for (const kind of ["expense", "income"] as const) {
        expect([...mapaColoresCategoriasDelCatalogo(CATALOGO, kind, modo).entries()]).toEqual([
          ...viejo(kind, modo).entries(),
        ]);
      }
    }
  });

  it("de la novena categoría en adelante comparte el gris neutro", () => {
    const muchas: Categoria[] = Array.from({ length: 9 }, (_, i) => ({
      id: `c-${i}`,
      name: `Categoría ${i}`,
      kind: "expense",
      archivedAt: null,
    }));
    const mapa = mapaColoresCategoriasDelCatalogo(muchas, "expense", "claro");

    expect(mapa.get("c-8")).toBe(COLOR_NEUTRO.claro);
  });
});
