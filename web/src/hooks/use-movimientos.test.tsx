// @vitest-environment jsdom
/**
 * La anulación de una compra pagada con dos cuentas (y de una transferencia)
 * refresca las consultas SIEMPRE, también cuando el servidor responde con
 * error: un 409 ("ya está anulada", p. ej. desde otro aparato) deja la fila
 * desactualizada hasta recargar, y es justo lo que hay que refrescar.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ anular: vi.fn(), anularTransferencia: vi.fn() }));

vi.mock("@/lib/api/transactions", () => ({
  createTransaction: vi.fn(),
  createTransfer: vi.fn(),
  createSplitPayment: vi.fn(),
  fetchTransactions: vi.fn(),
  reverseTransaction: vi.fn(),
  reverseSplitPayment: (...args: unknown[]) => api.anular(...args),
  reverseTransfer: (...args: unknown[]) => api.anularTransferencia(...args),
  updateTransactionBudgetItem: vi.fn(),
  updateTransactionCategory: vi.fn(),
}));

import { clavesMovimientos, useAnularPagoDividido, useAnularTransferencia } from "./use-movimientos";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Probador() {
  const anular = useAnularPagoDividido();
  return (
    <button type="button" onClick={() => anular.mutate("g-1")}>
      anular
    </button>
  );
}

function montar() {
  const cliente = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidar = vi.spyOn(cliente, "invalidateQueries");
  render(
    <QueryClientProvider client={cliente}>
      <Probador />
    </QueryClientProvider>
  );
  return invalidar;
}

describe("useAnularPagoDividido", () => {
  it("al anular bien, refresca los movimientos (y lo demás que cambia con el dinero)", async () => {
    api.anular.mockResolvedValue({ data: { paymentGroupId: "g-2", legs: [] } });
    const invalidar = montar();

    fireEvent.click(screen.getByRole("button", { name: "anular" }));

    await waitFor(() => expect(invalidar).toHaveBeenCalled());
    expect(api.anular).toHaveBeenCalledWith("g-1");
    const llaves = invalidar.mock.calls.map((llamada) => JSON.stringify(llamada[0]?.queryKey));
    expect(llaves).toContain(JSON.stringify(clavesMovimientos.todas()));
  });

  it("si el servidor rechaza (409), también refresca: la fila no se queda como si siguiera activa", async () => {
    api.anular.mockRejectedValue(new Error("Esa compra ya está anulada."));
    const invalidar = montar();

    fireEvent.click(screen.getByRole("button", { name: "anular" }));

    await waitFor(() => expect(invalidar).toHaveBeenCalled());
    const llaves = invalidar.mock.calls.map((llamada) => JSON.stringify(llamada[0]?.queryKey));
    expect(llaves).toContain(JSON.stringify(clavesMovimientos.todas()));
  });
});

describe("useAnularTransferencia", () => {
  function montarTransferencia() {
    const cliente = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidar = vi.spyOn(cliente, "invalidateQueries");
    function Probador() {
      const anular = useAnularTransferencia();
      return (
        <button type="button" onClick={() => anular.mutate("tg-1")}>
          anular
        </button>
      );
    }
    render(
      <QueryClientProvider client={cliente}>
        <Probador />
      </QueryClientProvider>
    );
    return invalidar;
  }

  it("al anular bien, refresca las mismas consultas que la compra dividida", async () => {
    api.anularTransferencia.mockResolvedValue({ data: { transferGroupId: "tg-2", legs: [] } });
    const invalidar = montarTransferencia();

    fireEvent.click(screen.getByRole("button", { name: "anular" }));

    await waitFor(() => expect(invalidar).toHaveBeenCalled());
    expect(api.anularTransferencia).toHaveBeenCalledWith("tg-1");
    const llaves = invalidar.mock.calls.map((llamada) => JSON.stringify(llamada[0]?.queryKey));
    expect(llaves).toContain(JSON.stringify(clavesMovimientos.todas()));
  });

  it("si el servidor rechaza (409 ya anulada), también refresca", async () => {
    api.anularTransferencia.mockRejectedValue(new Error("Esa transferencia ya está anulada."));
    const invalidar = montarTransferencia();

    fireEvent.click(screen.getByRole("button", { name: "anular" }));

    await waitFor(() => expect(invalidar).toHaveBeenCalled());
    const llaves = invalidar.mock.calls.map((llamada) => JSON.stringify(llamada[0]?.queryKey));
    expect(llaves).toContain(JSON.stringify(clavesMovimientos.todas()));
  });
});
