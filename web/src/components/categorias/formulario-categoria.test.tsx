// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { FormularioCategoria } from "./formulario-categoria";

vi.mock("@/hooks/use-categorias", () => ({
  useCrearCategoria: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("@/hooks/use-perfil", () => ({
  useSoloMirar: () => false,
}));

afterEach(cleanup);

/**
 * El piso táctil: el tipo de categoría (Gasto/Ingreso) se toca con el pulgar,
 * así que sus segmentos miden 44px (la variante `tap`), igual que los
 * formularios de movimiento, cuenta y presupuesto. jsdom no maquilla CSS, así
 * que aquí se fija la variante que el formulario le pide al ToggleGroup.
 */
function tienePisoDePulgar(boton: HTMLElement) {
  return boton.classList.contains("h-11") && boton.classList.contains("min-w-11");
}

describe("FormularioCategoria: el tipo usa el piso de 44px del pulgar", () => {
  it("Gasto e Ingreso miden 44px dentro del cajón", () => {
    render(
      <FormularioCategoria>
        <button type="button">Nueva</button>
      </FormularioCategoria>
    );

    fireEvent.click(screen.getByRole("button", { name: "Nueva" }));

    // El grupo pide `tap` explícitamente y los segmentos lo heredan por
    // contexto; se fijan las dos cosas.
    expect(document.querySelector('[data-slot="toggle-group"]')).toHaveAttribute(
      "data-size",
      "tap"
    );

    for (const nombre of ["Gasto", "Ingreso"]) {
      const segmento = screen.getByRole("button", { name: nombre });
      expect(tienePisoDePulgar(segmento)).toBe(true);
    }
  });

  it("el campo Nombre y el botón Crear categoría miden 44px", () => {
    // Eran Input y Button de 32px (h-8): los dos se tocan con el dedo.
    render(
      <FormularioCategoria>
        <button type="button">Nueva</button>
      </FormularioCategoria>
    );

    fireEvent.click(screen.getByRole("button", { name: "Nueva" }));

    expect(screen.getByLabelText("Nombre").className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Crear categoría" }).className).toContain(
      "min-h-11"
    );
  });
});
