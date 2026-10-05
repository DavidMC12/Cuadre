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
  it("el trigger del selector de categoría lleva el piso de toque", () => {
    // Era un SelectTrigger de 32px (h-8). La altura h-8 gana la cascada, así
    // que el piso va con min-h-11: sube la altura mínima por otra propiedad sin
    // pelear con la variante del componente base.
    render(<SelectorCategoria id="categoria-movimiento" value={undefined} onChange={vi.fn()} />);

    expect(screen.getByRole("combobox").className).toContain("min-h-11");
  });
});
