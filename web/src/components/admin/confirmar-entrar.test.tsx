// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { ConfirmarEntrar } from "./confirmar-entrar";
import type { UsuarioDelSistema } from "@/hooks/use-admin";

afterEach(cleanup);

const persona: UsuarioDelSistema = {
  id: "u-1",
  email: "sam@cuadre.co",
  name: "Sam",
  role: "user",
  banned: false,
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("ConfirmarEntrar: la confirmación en reposo y entrando", () => {
  it("muestra a quién se entra en título y chip, y las consecuencias en palabras", () => {
    render(<ConfirmarEntrar persona={persona} procesando={false} onConfirmar={vi.fn()} onCancelar={vi.fn()} />);

    expect(screen.getByText("¿Entrar a la cuenta de Sam?")).toBeInTheDocument();
    expect(screen.getByText("sam@cuadre.co")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Vas a ver lo mismo que su dueño ve: sus movimientos y sus saldos. Desde ahí no se puede cambiar nada, solo se mira. La entrada queda registrada./
      )
    ).toBeInTheDocument();
  });

  it("mientras la suplantación corre, los dos botones se apagan y dice 'Entrando…'", () => {
    render(<ConfirmarEntrar persona={persona} procesando={true} onConfirmar={vi.fn()} onCancelar={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Entrando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    // Nadie puede volver a disparar la suplantación con el diálogo a medio camino.
    expect(screen.queryByRole("button", { name: "Sí, entrar" })).not.toBeInTheDocument();
  });

  it("'Cancelar' y 'Entrando…' llevan el piso de toque de 44px", () => {
    render(<ConfirmarEntrar persona={persona} procesando={true} onConfirmar={vi.fn()} onCancelar={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Cancelar" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Entrando…" }).className).toContain("min-h-11");
  });
});
