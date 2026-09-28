// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import PaginaResumen from "./page";
import * as reportes from "@/hooks/use-reportes";
import * as ordenCuentas from "@/hooks/use-cuentas";
import { ApiError } from "@/lib/api/client";
import type { Cuenta, ResumenMes } from "@/lib/api/types";

vi.mock("next/link", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock("@/hooks/use-reportes", () => ({
  useMonedas: vi.fn(),
  useResumenMes: vi.fn(),
  useTendencia: vi.fn(),
}));

vi.mock("@/hooks/use-cuentas", () => ({
  useCuentas: vi.fn(),
}));

vi.mock("@/hooks/use-perfil", () => ({
  useIrAPantallaDeInicio: () => undefined,
}));

// Lo pesado —cajones, selectores, gráficas de recharts y el panel del
// presupuesto, prohibido a otro agente por ahora— no es lo que se prueba
// aquí: lo que importa es que un fallo de consulta no se disfrace de datos.
vi.mock("@/components/dashboard/selector-mes", () => ({ SelectorMes: () => null }));
vi.mock("@/components/dashboard/total-cuentas", () => ({ TotalCuentas: () => null }));
vi.mock("@/components/dashboard/total-ahorrado", () => ({ TotalAhorrado: () => null }));
vi.mock("@/components/dashboard/grafica-por-categoria", () => ({
  GraficaPorCategoria: () => null,
}));
vi.mock("@/components/dashboard/grafica-tendencia", () => ({ GraficaTendencia: () => null }));
vi.mock("@/components/dashboard/grafica-ahorro", () => ({ GraficaAhorro: () => null }));
vi.mock("@/components/presupuesto/panel-presupuesto", () => ({
  PanelPresupuesto: () => null,
}));

interface Stub {
  data?: unknown;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  isFetching?: boolean;
  refetch?: () => void;
}

function refetchable(stub: Stub = {}): Stub {
  return {
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
    ...stub,
  };
}

const cuantas: Cuenta[] = [
  {
    id: "cuenta-1",
    name: "Bancolombia",
    currency: "COP",
    balance: "1234567",
    isSavings: false,
    archivedAt: null,
  } as Cuenta,
];

const resumen: ResumenMes = { income: "500000", expense: "200000", net: "300000" } as ResumenMes;

function ajustar(
  overrides: {
    deMonedas?: Stub;
    deResumen?: Stub;
    deTendencia?: Stub;
    deCuentas?: Stub;
  } = {}
) {
  const { deMonedas, deResumen, deTendencia, deCuentas } = overrides;

  vi.mocked(reportes.useMonedas).mockImplementation(
    () => refetchable({ data: ["COP"], ...deMonedas }) as never
  );
  vi.mocked(reportes.useResumenMes).mockImplementation(
    () => refetchable({ data: resumen, ...deResumen }) as never
  );
  vi.mocked(reportes.useTendencia).mockImplementation(
    () => refetchable({ data: [], ...deTendencia }) as never
  );
  vi.mocked(ordenCuentas.useCuentas).mockImplementation(
    () => refetchable({ data: cuantas, ...deCuentas }) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ajustar({});
});

afterEach(cleanup);

describe("Resumen: un fallo de red no es un cero ni un mes vacío", () => {
  it('si la consulta de monedas falla, no dice "Todavía no hay nada que resumir": muestra error y Reintentar', () => {
    const recargar = vi.fn();
    ajustar({ deMonedas: { data: undefined, isError: true, error: new Error("boom"), refetch: recargar } });

    render(<PaginaResumen />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No pudimos cargar las monedas. Puede ser que el servidor esté dormido."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    // Esto era verdad antes y sería lo grave: presentaba un fallo como si no hubiera nada.
    expect(screen.queryByText("Todavía no hay nada que resumir")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("un fallo con una sesión vencida usa el mensaje en español del servidor", () => {
    ajustar({
      deMonedas: {
        data: undefined,
        isError: true,
        error: new ApiError({ code: "UNAUTHORIZED", message: "Tu sesión expiró. Vuelve a entrar." }),
      },
    });

    render(<PaginaResumen />);
    expect(screen.getByText("Tu sesión expiró. Vuelve a entrar.")).toBeInTheDocument();
  });

  it('de verdad sin monedas sigue diciendo "Todavía no hay nada que resumir", sin botón de reintentar', () => {
    ajustar({ deMonedas: { data: [] } });

    render(<PaginaResumen />);

    expect(screen.getByText("Todavía no hay nada que resumir")).toBeInTheDocument();
    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
  });

  it("si la consulta del resumen falla, no pinta $0 en Ingresos/Gastos/Balance: muestra error y Reintentar", () => {
    const recargar = vi.fn();
    ajustar({
      deResumen: {
        data: undefined,
        isError: true,
        error: new Error("boom"),
        refetch: recargar,
      },
    });

    const { container } = render(<PaginaResumen />);

    expect(
      screen.getByText(
        "No pudimos cargar el resumen del mes. Puede ser que el servidor esté dormido."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    // El disgusto completo del hallazgo: hasta que enfrenta el fallo, el
    // resumen entero se dibujaba como un mes sin plata.
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
    expect(screen.queryByText("Ingresos")).not.toBeInTheDocument();
    expect(screen.queryByText("Gastos")).not.toBeInTheDocument();
    expect(screen.queryByText("Balance del mes")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(recargar).toHaveBeenCalledTimes(1);
    expect(container).toBeInTheDocument();
  });

  it("con todo cargado muestra la pantalla de siempre, sin error ni Reintentar", () => {
    render(<PaginaResumen />);

    expect(screen.getByRole("heading", { name: "Resumen" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
    expect(screen.getByText("Ingresos")).toBeInTheDocument();
    expect(screen.getByText("Gastos")).toBeInTheDocument();
    expect(screen.getByText("Balance del mes")).toBeInTheDocument();
  });
});
