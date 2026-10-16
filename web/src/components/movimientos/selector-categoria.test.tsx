// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { SelectorCategoria } from "./selector-categoria";

vi.mock("@/hooks/use-categorias", () => ({
  useCategorias: vi.fn(() => ({
    data: [{ id: "c-1", name: "Mercado", kind: "expense", archivedAt: null }],
  })),
}));

afterEach(cleanup);

describe("SelectorCategoria: piso de toque de 44px", () => {
  it("el trigger del selector de categoría lleva el piso de toque", () => {    // Era un SelectTrigger de 32px (h-8). La altura h-8 gana la cascada, así
    // que el piso va con min-h-11: sube la altura mínima por otra propiedad sin
    // pelear con la variante del componente base.
    render(<SelectorCategoria id="categoria-movimiento" value={undefined} onChange={vi.fn()} />);

    expect(screen.getByRole("combobox").className).toContain("min-h-11");
  });
});

describe("SelectorCategoria: nunca muestra el id de una categoría que no nombra", () => {
  it("una categoría que la lista no trae (se archivó) muestra una frase neutra, no el id", () => {
    // La lista solo incluye activas; un movimiento de una categoría archivada
    // llega con su id. El rótulo del trigger es honesto: hay categoría, solo
    // que no hay nombre a la mano.
    render(<SelectorCategoria id="categoria-movimiento" value="c-archivada" onChange={vi.fn()} />);

    const trigger = screen.getByRole("combobox");
    expect(trigger.textContent).not.toContain("c-archivada");
    expect(trigger.textContent).toContain("Categoría sin nombre");
  });

  it("una categoría que sí está en la lista sigue mostrando su nombre", () => {
    render(<SelectorCategoria id="categoria-movimiento" value="c-1" onChange={vi.fn()} />);

    expect(screen.getByRole("combobox").textContent).toContain("Mercado");
  });
});
