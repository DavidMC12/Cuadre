// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { ResumenCards } from "./resumen-cards";
import type { ResumenMes } from "@/lib/api/types";

afterEach(cleanup);

const resumen: ResumenMes = { month: "2026-09", currency: "COP", income: "100000", expense: "40000", net: "60000" };

describe("ResumenCards", () => {
  it("cuando la consulta del resumen falla, muestra error y Reintentar — nunca un cero falso", () => {
    const reintentar = vi.fn();
    render(
      <ResumenCards
        resumen={undefined}
        moneda="COP"
        cargando={false}
        fallo={{
          mensaje: "No pudimos cargar el resumen del mes. Revisa tu conexión y vuelve a intentarlo.",
          onReintentar: reintentar,
        }}
      />
    );

    expect(
      screen.getByText("No pudimos cargar el resumen del mes. Revisa tu conexión y vuelve a intentarlo.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    // La pantalla de fallo no deriva nada del resumen que no existe.
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
    expect(screen.queryByText("Ingresos")).not.toBeInTheDocument();
    expect(screen.queryByText("Gastos")).not.toBeInTheDocument();
    expect(screen.queryByText("Balance del mes")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reintentar).toHaveBeenCalledTimes(1);
  });

  it("cuando comparte pantalla con otro fallo, deja de anunciar solo (group, no alert)", () => {
    render(
      <ResumenCards
        resumen={undefined}
        moneda="COP"
        cargando={false}
        compartePantalla
        fallo={{
          mensaje: "No pudimos cargar el resumen del mes. Revisa tu conexión y vuelve a intentarlo.",
          onReintentar: vi.fn(),
          etiquetaBoton: "Reintentar resumen",
        }}
      />
    );

    // La pantalla ya trae el anuncio único: el bloque queda completo —mensaje
    // y su Reintentar con etiqueta propia— pero sin alerta propia.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("group")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar resumen" })).toBeInTheDocument();
  });

  it("un error de UNAUTHORIZED usa el mensaje del servidor", () => {
    render(
      <ResumenCards
        resumen={undefined}
        moneda="COP"
        cargando={false}
        fallo={{ mensaje: "Tu sesión expiró.", onReintentar: vi.fn() }}
      />
    );

    expect(screen.getByText("Tu sesión expiró.")).toBeInTheDocument();
  });

  it("con el resumen cargado muestra los números reales, no el bloque de fallo", () => {
    render(<ResumenCards resumen={resumen} moneda="COP" cargando={false} />);

    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
    expect(screen.getByText("Ingresos")).toBeInTheDocument();
    expect(screen.getByText("Gastos")).toBeInTheDocument();
    expect(screen.getByText("Balance del mes")).toBeInTheDocument();
  });

  it("mientras carga muestra esqueletos, no números", () => {
    render(<ResumenCards resumen={undefined} moneda="COP" cargando />);

    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
    expect(screen.queryByText("Ingresos")).not.toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).not.toBeNull();
  });
});
