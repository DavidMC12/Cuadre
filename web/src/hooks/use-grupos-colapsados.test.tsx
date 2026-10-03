// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { olvidarGruposColapsadosEnMemoria, useGruposColapsados } from "./use-grupos-colapsados";
import { CLAVE_ALMACEN_GRUPOS_CERRADOS } from "@/lib/preferencias-grupos-presupuesto";

const VALIDAS = new Set(["cat-comida", "cat-transporte", "cat-ocio", "ahorro", "sin-categoria"]);

function Sonda() {
  const { colapsados, alternar, contraerTodo, expandirTodo } = useGruposColapsados(VALIDAS);
  return (
    <div>
      <span data-testid="estado">{[...colapsados].sort().join(",")}</span>
      <button type="button" onClick={() => alternar("cat-comida")}>
        alternar comida
      </button>
      <button type="button" onClick={() => contraerTodo(["cat-transporte"])}>
        sumar transporte
      </button>
      <button type="button" onClick={() => expandirTodo()}>
        desplegar
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  olvidarGruposColapsadosEnMemoria();
});

describe("useGruposColapsados", () => {
  it("lee lo guardado al montar", () => {
    window.localStorage.setItem(CLAVE_ALMACEN_GRUPOS_CERRADOS, JSON.stringify(["cat-comida"]));

    render(<Sonda />);

    expect(screen.getByTestId("estado").textContent).toBe("cat-comida");
  });

  it("alternar guarda la intención", () => {
    render(<Sonda />);

    fireEvent.click(screen.getByRole("button", { name: "alternar comida" }));

    expect(screen.getByTestId("estado").textContent).toBe("cat-comida");
    expect(JSON.parse(window.localStorage.getItem(CLAVE_ALMACEN_GRUPOS_CERRADOS)!)).toEqual([
      "cat-comida",
    ]);
  });

  it("si el almacén no deja escribir, el cambio igual se ve en pantalla", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });

    render(<Sonda />);
    fireEvent.click(screen.getByRole("button", { name: "alternar comida" }));

    // Sin persistencia, el toggle no puede quedar inerte.
    expect(screen.getByTestId("estado").textContent).toBe("cat-comida");
  });

  it("el evento storage de otra pestaña actualiza", () => {
    render(<Sonda />);
    expect(screen.getByTestId("estado").textContent).toBe("");

    window.localStorage.setItem(CLAVE_ALMACEN_GRUPOS_CERRADOS, JSON.stringify(["cat-transporte"]));
    fireEvent(window, new StorageEvent("storage", { key: CLAVE_ALMACEN_GRUPOS_CERRADOS }));

    expect(screen.getByTestId("estado").textContent).toBe("cat-transporte");
  });

  it("dos sondas montadas a la vez se sincronizan", () => {
    render(
      <>
        <Sonda />
        <Sonda />
      </>
    );

    fireEvent.click(screen.getAllByRole("button", { name: "alternar comida" })[0]);

    for (const estado of screen.getAllByTestId("estado")) {
      expect(estado.textContent).toBe("cat-comida");
    }
  });

  it("contraerTodo suma a lo ya cerrado", () => {
    window.localStorage.setItem(CLAVE_ALMACEN_GRUPOS_CERRADOS, JSON.stringify(["cat-ocio"]));

    render(<Sonda />);
    fireEvent.click(screen.getByRole("button", { name: "sumar transporte" }));

    expect(screen.getByTestId("estado").textContent).toBe("cat-ocio,cat-transporte");
  });

  it("expandirTodo vacía lo cerrado y lo guardado", () => {
    window.localStorage.setItem(
      CLAVE_ALMACEN_GRUPOS_CERRADOS,
      JSON.stringify(["cat-ocio", "cat-transporte"])
    );

    render(<Sonda />);
    expect(screen.getByTestId("estado").textContent).toBe("cat-ocio,cat-transporte");

    fireEvent.click(screen.getByRole("button", { name: "desplegar" }));

    expect(screen.getByTestId("estado").textContent).toBe("");
    expect(JSON.parse(window.localStorage.getItem(CLAVE_ALMACEN_GRUPOS_CERRADOS)!)).toEqual([]);
  });
});
