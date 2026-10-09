// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import { RegistrosAhorro } from "./registros-ahorro";
import type { RegistroDeAhorro } from "@/lib/api/types";

afterEach(cleanup);

function registro(datos: Partial<RegistroDeAhorro> & Pick<RegistroDeAhorro, "amount">): RegistroDeAhorro {
  return {
    id: "reg-1",
    accountId: "cta-1",
    currency: "COP",
    occurredAt: "2026-10-08T15:00:00.000Z",
    description: null,
    ...datos,
  };
}

describe("RegistrosAhorro", () => {
  it("un aparte se lee con su verbo y su fecha", () => {
    render(<RegistrosAhorro cargando={false} registros={[registro({ amount: "500000" })]} />);

    expect(screen.getByText("Apartaste $500.000")).toBeInTheDocument();
    expect(screen.getByText("Hoy")).toBeInTheDocument();
  });

  it("un retiro se lee sin el menos: el verbo ya dice que se retiró", () => {
    render(<RegistrosAhorro cargando={false} registros={[registro({ amount: "-25000" })]} />);

    expect(screen.getByText("Retiraste $25.000")).toBeInTheDocument();
  });

  it("la descripción opcional se muestra, la de texto vacío no", () => {
    render(
      <RegistrosAhorro
        cargando={false}
        registros={[
          registro({ amount: "500000", description: "Prima de junio" }),
        ]}
      />
    );

    expect(screen.getByText("Prima de junio")).toBeInTheDocument();
  });

  it("sin registros se dice sobrio, no como un error ni vacío", () => {
    render(<RegistrosAhorro cargando={false} registros={[]} />);

    expect(screen.getByText("Aún no has anotado ahorro aquí.")).toBeInTheDocument();
    // Sin lista que recorrer: no hay nada que navegar.
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("con registros la lista tiene nombre accesible", () => {
    render(<RegistrosAhorro cargando={false} registros={[registro({ amount: "500000" })]} />);

    expect(screen.getByRole("list", { name: "Últimos registros de ahorro" })).toBeInTheDocument();
  });

  it("cargando muestra el esqueleto y no un 'sin registros' que sería mentira", () => {
    const { container } = render(<RegistrosAhorro cargando registros={undefined} />);

    expect(screen.queryByText("Aún no has anotado ahorro aquí.")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("un fallo no se disfraza de vacío: se dice qué pasó y se ofrece reintentar", () => {
    const intento = vi.fn();
    render(
      <RegistrosAhorro
        cargando={false}
        registros={undefined}
        fallo={{
          mensaje: "No pudimos cargar tus anotaciones de ahorro. Revisa tu conexión y vuelve a intentarlo.",
          reintento: false,
          onReintentar: intento,
        }}
      />
    );

    expect(screen.queryByText("Aún no has anotado ahorro aquí.")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "No pudimos cargar tus anotaciones de ahorro. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar anotaciones" }));
    expect(intento).toHaveBeenCalledTimes(1);
  });
});
