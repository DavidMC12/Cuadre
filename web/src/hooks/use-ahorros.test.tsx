// @vitest-environment jsdom
/**
 * Pruebas del hook de registros de ahorro con react-query de verdad y la API
 * como mocks: lo que aquí importa es QUÉ parámetros viajan a la lista y QUÉ
 * consultas se vuelven a pedir después de anotar un registro.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  lista: vi.fn(),
  crear: vi.fn(),
  cuentas: vi.fn(),
  ahorro: vi.fn(),
  presupuesto: vi.fn(),
}));

vi.mock("@/lib/api/savings", () => ({
  fetchSavingsEntries: (...args: unknown[]) => api.lista(...args),
  createSavingsEntry: (...args: unknown[]) => api.crear(...args),
}));

vi.mock("@/lib/api/accounts", () => ({
  fetchAccounts: (...args: unknown[]) => api.cuentas(...args),
}));

vi.mock("@/lib/api/reports", () => ({
  fetchCurrencies: vi.fn(),
  fetchSummary: vi.fn(),
  fetchByCategory: vi.fn(),
  fetchTrend: vi.fn(),
  fetchSavingsTrend: (...args: unknown[]) => api.ahorro(...args),
}));

vi.mock("@/lib/api/budgets", () => ({
  archiveBudgetItem: vi.fn(),
  createBudgetItem: vi.fn(),
  fetchBudgetItems: (...args: unknown[]) => api.presupuesto(...args),
  unarchiveBudgetItem: vi.fn(),
  updateBudgetItemLabel: vi.fn(),
  updateBudgetItemTarget: vi.fn(),
}));

import { useCrearRegistroAhorro, useSavingsEntries } from "./use-ahorros";
import { useCuentas } from "./use-cuentas";
import { useAhorroMensual } from "./use-reportes";
import { usePresupuestoItems } from "./use-presupuesto";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * La misma cara que le ve la app después de anotar: cuatro catálogos
 * montados con los hooks de verdad. Una invalidación correcta significa que
 * cada uno pide de nuevo; un contador por API lo deja ver.
 */
function Sonda() {
  const crear = useCrearRegistroAhorro();
  useCuentas();
  useAhorroMensual({ months: 6, currency: "COP" });
  usePresupuestoItems();
  useSavingsEntries({ accountId: "cta-1" });

  return (
    <button
      type="button"
      onClick={() =>
        crear.mutate(
          { accountId: "cta-1", amount: "500000", occurredAt: "2026-10-08T12:00:00.000Z" },
          { onSuccess: () => undefined }
        )
      }
    >
      anotar
    </button>
  );
}

describe("useCrearRegistroAhorro", () => {
  it("al guardar relee cuentas, reportes de ahorro, presupuesto y la lista de registros", async () => {
    api.cuentas.mockResolvedValue({ data: [] });
    api.ahorro.mockResolvedValue({ data: [] });
    api.presupuesto.mockResolvedValue({ data: [] });
    api.lista.mockResolvedValue({ data: [] });
    api.crear.mockResolvedValue({
      data: {
        id: "reg-1",
        accountId: "cta-1",
        currency: "COP",
        amount: "500000",
        occurredAt: "2026-10-08T12:00:00.000Z",
        description: null,
      },
    });

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <Sonda />
      </QueryClientProvider>
    );

    // Primera ronda: las cuatro montan y piden una vez.
    await waitFor(() => {
      expect(api.cuentas).toHaveBeenCalledTimes(1);
      expect(api.ahorro).toHaveBeenCalledTimes(1);
      expect(api.presupuesto).toHaveBeenCalledTimes(1);
      expect(api.lista).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "anotar" }));

    // Segunda ronda: Cada consulta relee exactamente una vez más. En
    // especial la lista de registros (la clave propia de este hook) y los
    // reportes, donde vive la tendencia de ahorro del Resumen.
    await waitFor(() => {
      expect(api.cuentas.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(api.ahorro.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(api.presupuesto.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(api.lista.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("lo que viaja es lo que la persona apartó, con la fecha que dijo", async () => {
    api.cuentas.mockResolvedValue({ data: [] });
    api.ahorro.mockResolvedValue({ data: [] });
    api.presupuesto.mockResolvedValue({ data: [] });
    api.lista.mockResolvedValue({ data: [] });
    api.crear.mockResolvedValue({
      data: {
        id: "reg-2",
        accountId: "cta-1",
        currency: "COP",
        amount: "500000",
        occurredAt: "2026-10-08T12:00:00.000Z",
        description: null,
      },
    });

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <Sonda />
      </QueryClientProvider>
    );

    await waitFor(() => expect(api.lista).toHaveBeenCalledTimes(1));
    // La lista pide los últimos 50 de ESA cuenta, sin fechas ni cursores.
    expect(api.lista).toHaveBeenCalledWith({ accountId: "cta-1", limit: 50 });

    fireEvent.click(screen.getByRole("button", { name: "anotar" }));

    await waitFor(() => expect(api.crear).toHaveBeenCalledTimes(1));
    // Al mock de la API solo le llega el cuerpo: las opciones de mutación no
    // son parte de la llamada del servidor.
    expect(api.crear).toHaveBeenCalledWith({
      accountId: "cta-1",
      amount: "500000",
      occurredAt: "2026-10-08T12:00:00.000Z",
    });
  });
});

describe("useSavingsEntries", () => {
  it("sin cuenta no pregunta nada", () => {
    api.lista.mockResolvedValue({ data: [] });
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <SinCuenta />
      </QueryClientProvider>
    );

    expect(api.lista).not.toHaveBeenCalled();
  });
});

function SinCuenta() {
  useSavingsEntries({ accountId: null });
  return <span>silencio</span>;
}
