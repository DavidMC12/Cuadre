// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

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

vi.mock("@/components/dashboard/selector-mes", () => ({
  SelectorMes: () => null,
}));

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
        "No pudimos cargar las monedas. Puede ser que el servidor esté dormido."
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
});
