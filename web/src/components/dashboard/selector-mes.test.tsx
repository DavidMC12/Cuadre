// @vitest-environment jsdom
/**
 * El piso de toque de 44px (más DESIGN.md y la séptima critique): las dos
 * flechas del selector de mes se renderizaban con `size="icon-sm"` (28px),
 * un objetivo que el dedo en un móvil pisa con error. La prueba fija las
 * clases `min-h-11`/`min-w-11` que devuelven el objetivo real al piso — si
 * alguien las quita (o vuelve a un `size="icon-sm"` sin override), esta
 * prueba cae.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { SelectorMes } from "./selector-mes";

describe("SelectorMes: piso de toque de 44px", () => {
  afterEach(cleanup);

  it("las dos flechas llevan el piso de 44px en alto y ancho", () => {
    render(<SelectorMes mes="2026-10" onCambiar={() => {}} />);

    for (const nombre of ["Mes anterior", "Mes siguiente"]) {
      const flecha = screen.getByRole("button", { name: nombre });
      expect(flecha.classList.contains("min-h-11")).toBe(true);
      expect(flecha.classList.contains("min-w-11")).toBe(true);
    }
  });
});
