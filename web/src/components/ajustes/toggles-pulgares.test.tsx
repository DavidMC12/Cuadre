// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { SelectorTema } from "./selector-tema";
import { OpcionGuardada } from "./opcion-guardada";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

vi.mock("@/hooks/use-perfil", () => ({
  useGuardarPerfil: () => ({ mutate: vi.fn(), isPending: false }),
  useSoloMirar: () => false,
}));

afterEach(cleanup);

/**
 * El piso táctil: todo segmento que se toca con el pulgar mide 44px (la
 * variante `tap`), igual que los formularios de movimiento y cuenta. jsdom
 * no maquilla CSS, así que aquí se fija la variante que los componentes le
 * piden al ToggleGroup, no el render.
 */
function tienePisoDePulgar(boton: HTMLElement) {
  return boton.classList.contains("h-11") && boton.classList.contains("min-w-11");
}

describe("Los toggles de Ajustes usan el piso de 44px del pulgar", () => {
  it("el selector de tema", () => {
    render(<SelectorTema />);

    for (const nombre of ["Claro", "Oscuro", "Automático"]) {
      expect(tienePisoDePulgar(screen.getByRole("button", { name: nombre }))).toBe(true);
    }
  });

  it("cada preferencia guardada (moneda, al abrir…)", () => {
    render(
      <OpcionGuardada
        valor="COP"
        opciones={[
          { valor: "auto", etiqueta: "Automática" },
          { valor: "COP", etiqueta: "COP" },
          { valor: "USD", etiqueta: "USD" },
        ]}
        aCambio={() => ({ defaultCurrency: "USD" })}
      />
    );

    for (const nombre of ["Automática", "COP", "USD"]) {
      expect(tienePisoDePulgar(screen.getByRole("button", { name: nombre }))).toBe(true);
    }
  });
});
