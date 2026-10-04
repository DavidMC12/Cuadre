// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  FalloConsulta,
  estadoDeConsulta,
  mensajeDeCargaFallida,
  mensajeSinConexion,
} from "./fallo-consulta";

afterEach(cleanup);

describe("estadoDeConsulta: la política única, en una tabla", () => {
  it("un fallo sin datos manda sobre el esqueleto", () => {
    expect(estadoDeConsulta({ data: undefined, isError: true, isLoading: true })).toBe("fallo");
  });

  it("una consulta pausada sin datos es 'pausada', aunque también esté cargando", () => {
    expect(estadoDeConsulta({ data: undefined, isPaused: true, isLoading: true })).toBe("pausada");
    // Un fallo manda sobre la pausa.
    expect(estadoDeConsulta({ data: undefined, isError: true, isPaused: true })).toBe("fallo");
  });

  it("mientras carga sin datos es esqueleto", () => {
    expect(estadoDeConsulta({ data: undefined, isLoading: true })).toBe("cargando");
  });

  it("con datos —aunque estén viejos, pausados o con error— siempre 'ok'", () => {
    expect(estadoDeConsulta({ data: [], isPaused: true })).toBe("ok");
    expect(estadoDeConsulta({ data: [], isError: true })).toBe("ok");
    expect(estadoDeConsulta({ data: [], isLoading: true })).toBe("ok");
    expect(estadoDeConsulta({ data: [] })).toBe("ok");
  });

  it("sin ninguna señal tampoco miente: 'ok' (el vacío lo decide la pantalla)", () => {
    expect(estadoDeConsulta({ data: undefined })).toBe("ok");
  });
});

describe("la voz de los mensajes", () => {
  it("un fallo genérico no habla de infraestructura", () => {
    expect(mensajeDeCargaFallida("tus cuentas")).toBe(
      "No pudimos cargar tus cuentas. Revisa tu conexión y vuelve a intentarlo."
    );
  });

  it("una consulta pausada dice la causa verdadera", () => {
    expect(mensajeSinConexion("tus cuentas")).toBe(
      "Sin conexión: no pudimos cargar tus cuentas. Revisa tu conexión y vuelve a intentarlo."
    );
  });
});

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
