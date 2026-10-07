// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

import PaginaPresupuesto from "./page";
import * as useReportesModule from "@/hooks/use-reportes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/presupuesto",
}));

vi.mock("@/hooks/use-reportes", () => ({
  useMonedas: vi.fn(),
}));

// Lo que prueba la pantalla, no el panel: el panel ya se cubre en
// panel-presupuesto.test.tsx.
vi.mock("@/components/presupuesto/panel-presupuesto", () => ({
  PanelPresupuesto: () => <div>panel-de-presupuesto</div>,
}));

// El selector de mes REAL: la pantalla pasa su tope de 12 meses adelante y
// el aviso de planeación depende del mes visto, que aquí se recorre con las
// flechas de verdad.

afterEach(cleanup);

function ajustarMonedas(stub: Record<string, unknown> = {}) {
  vi.mocked(useReportesModule.useMonedas).mockImplementation(
    () =>
      ({
        isLoading: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
        ...stub,
      }) as never
  );
}

describe("Página Presupuesto: casa propia del checklist", () => {
  it("si la consulta de monedas falla, muestra error y Reintentar — no un vacío que mienta", () => {
    ajustarMonedas({
      isError: true,
      error: new Error("boom"),
    });

    render(<PaginaPresupuesto />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No pudimos cargar las monedas. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay nada por revisar")).not.toBeInTheDocument();
  });

  it("de verdad sin monedas muestra su propio estado vacío, sin Reintentar", () => {
    ajustarMonedas({ data: [] });

    render(<PaginaPresupuesto />);

    expect(screen.getByText("Aún no hay nada por revisar")).toBeInTheDocument();
    // El vacío nombra la sección como el nav ("Presupuesto"), no "checklist".
    expect(
      screen.getByText(
        "Crea una cuenta y registra tu primer movimiento para empezar tu presupuesto del mes."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
  });

  it("con monedas monta el panel (variante suelta, la pantalla ya trae el encabezado)", () => {
    ajustarMonedas({ data: ["COP"] });

    render(<PaginaPresupuesto />);

    expect(screen.getByRole("heading", { name: "Presupuesto" })).toBeInTheDocument();
    expect(screen.getByText("panel-de-presupuesto")).toBeInTheDocument();
    // Con una sola moneda no hay selector de moneda, como en el Resumen.
    expect(screen.queryByText("Mostrando")).not.toBeInTheDocument();
  });

  it("el selector de moneda lleva el piso de toque de 44px", () => {
    // Séptima critique: con dos monedas el SelectTrigger size="sm" medía 28px.
    ajustarMonedas({ data: ["COP", "USD"] });

    render(<PaginaPresupuesto />);

    const disparador = screen.getByRole("combobox");
    expect(disparador.classList.contains("min-h-11")).toBe(true);
  });

  it("una consulta pausada sin red no se disfraza de 'aún no hay nada por revisar'", () => {
    ajustarMonedas({ data: undefined, isPaused: true });

    render(<PaginaPresupuesto />);

    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar las monedas. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay nada por revisar")).not.toBeInTheDocument();
    // Sin moneda no se monta el panel.
    expect(screen.queryByText("panel-de-presupuesto")).not.toBeInTheDocument();
  });
});

describe("Página Presupuesto: planear meses futuros", () => {
  function prepararPantalla() {
    ajustarMonedas({ data: ["COP"] });
    render(<PaginaPresupuesto />);
  }

  function flechaSiguiente() {
    return screen.getByRole("button", { name: "Mes siguiente" });
  }

  it("en el mes actual y en el pasado no aparece el aviso de planeación", () => {
    prepararPantalla();

    const aviso = "Aún no empieza: aquí planeas lo que esperas gastar o recibir.";

    // El mes de arranque es el actual: nada por planear todavía.
    expect(screen.queryByText(aviso)).not.toBeInTheDocument();

    // Un mes hacia atrás es pasado: el mes YA vivió, no se planea.
    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(screen.queryByText(aviso)).not.toBeInTheDocument();
  });

  it("al avanzar a un mes futuro aparece el aviso, discreto y con el tope de 12 meses", async () => {
    prepararPantalla();

    const aviso = "Aún no empieza: aquí planeas lo que esperas gastar o recibir.";

    // El primero ya es futuro: el aviso sale desde el primer avance y
    // acompaña los siguientes.
    fireEvent.click(flechaSiguiente());
    expect(screen.getByText(aviso)).toBeInTheDocument();

    // Doce meses adelante es el tope de la planeación: once clics más y la
    // flecha se apaga exactamente ahí — no antes. Cada clic exige que la
    // flecha SIGA habilitada: si la pantalla pasara 11 en vez de 12, el
    // último clic caería en un botón ya apagado y este bucle lo notaría.
    for (let i = 0; i < 11; i += 1) {
      expect(flechaSiguiente()).toBeEnabled();
      fireEvent.click(flechaSiguiente());
      expect(screen.getByText(aviso)).toBeInTheDocument();
    }
    await waitFor(() => expect(flechaSiguiente()).toBeDisabled());
  });
});
