// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

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

describe("ConfirmarEntrar: sin cierres mientras corre la suplantación (novena critique, P3)", () => {
  function renderEntrando() {
    const onCancelar = vi.fn();
    render(
      <ConfirmarEntrar persona={persona} procesando={true} onConfirmar={vi.fn()} onCancelar={onCancelar} />
    );
    return onCancelar;
  }

  it("mientras entra, ni la X ni Escape cierran el diálogo", () => {
    const onCancelar = renderEntrando();

    const antes = screen.getByRole("dialog");
    // La X de la ventana y Escape pasan los dos por onOpenChange: ahí vive
    // el bloqueo, porque un cierre a mitad de camino no cancela la
    // suplantación — la entrada igual ocurriría.
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByRole("dialog")).toBe(antes);
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it("mientras entra, el clic sobre el fondo tampoco cierra", () => {
    const onCancelar = renderEntrando();

    const fondo = document.querySelector('[data-slot="dialog-overlay"]');
    expect(fondo).not.toBeNull();
    fireEvent.pointerDown(fondo as Element);
    fireEvent.click(fondo as Element);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it("en reposo la X pasa el cierre hacia el padre: el bloqueo es solo mientras entra", () => {
    // `open` viene del prop `persona`, así que el desmontaje real de verdad
    // lo prueba la pantalla (page.test.tsx, "Cancelar cierra el diálogo").
    // Lo que ancla este componente es hacia dónde va el gesto de cierre:
    // con `procesando` el guard lo traga, sin él llega al padre. La misma
    // instancia re-renderiza, como la página: primero abre el diálogo y
    // después arranca la suplantación.
    const onCancelar = vi.fn();
    const vista = render(
      <ConfirmarEntrar persona={persona} procesando={false} onConfirmar={vi.fn()} onCancelar={onCancelar} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onCancelar).toHaveBeenCalledTimes(1);

    vista.rerender(
      <ConfirmarEntrar persona={persona} procesando={true} onConfirmar={vi.fn()} onCancelar={onCancelar} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onCancelar).toHaveBeenCalledTimes(1);

    vista.rerender(
      <ConfirmarEntrar persona={persona} procesando={false} onConfirmar={vi.fn()} onCancelar={onCancelar} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onCancelar).toHaveBeenCalledTimes(2);
  });
});
