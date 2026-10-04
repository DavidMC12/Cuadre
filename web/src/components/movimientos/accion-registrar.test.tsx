// @vitest-environment jsdom
/**
 * Piso de toque de 44px en el botón "Registrar" de escritorio (la séptima
 * crítica lo notable en ~36px por el py-2). La versión FAB del móvil mide
 * 56px y está fuera de esta prueba. El formulario real (cajones, selectores)
 * no es lo que se ancla aquí: solo su hijo, el botón.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { AccionRegistrar } from "./accion-registrar";

vi.mock("@/hooks/use-cuentas", () => ({
  useCuentas: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
}));

vi.mock("@/components/movimientos/formulario-movimiento", () => ({
  FormularioMovimiento: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(cleanup);

describe("AccionRegistrar: piso de toque de 44px", () => {
  it("la variante lateral (botón entero) mide al menos 44px", () => {
    render(<AccionRegistrar variante="cerrico" />);

    const boton = screen.getByRole("button", { name: "Registrar" });
    expect(boton.className).toContain("min-h-11");
    // El py-2 que ponía ~36px ya no va: quien fija la altura es min-h-11.
    expect(boton.className).not.toContain("py-2");
  });

  it("la variante flotante (FAB del móvil) sigue en 56px", () => {
    render(<AccionRegistrar variante="flotante" />);

    const boton = screen.getByLabel("Registrar movimiento");
    expect(boton.className).toContain("size-14");
  });
});
