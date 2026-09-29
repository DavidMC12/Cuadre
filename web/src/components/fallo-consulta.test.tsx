// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { FalloConsulta } from "./fallo-consulta";

afterEach(cleanup);

describe("FalloConsulta: el anuncio depende de la compañía", () => {
  it("por defecto es role=alert: el fallo de una pantalla con una sola consulta interrumpe", () => {
    const reintentar = vi.fn();
    render(
      <FalloConsulta
        mensaje="No pudimos cargar tus cuentas."
        onReintentar={reintentar}
        etiquetaBoton="Reintentar cuentas"
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar tus cuentas.");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("con compartePantalla baja a role=group: no interrumpe solo, la pantalla ya compone el anuncio", () => {
    render(
      <FalloConsulta
        mensaje="No pudimos cargar tus cuentas."
        onReintentar={vi.fn()}
        compartePantalla
      />
    );

    // El bloque sigue completo y navegable — mensaje y Reintentar — solo que
    // ya no dispara su propia alerta.
    expect(screen.getByRole("group")).toHaveTextContent("No pudimos cargar tus cuentas.");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("en cualquiera de los dos roles, Reintentar sigue funcionando", () => {
    const reintentar = vi.fn();
    render(
      <FalloConsulta mensaje="Fallo." onReintentar={reintentar} compartePantalla />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reintentar).toHaveBeenCalledTimes(1);
  });
});
