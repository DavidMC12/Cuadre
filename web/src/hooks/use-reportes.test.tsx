// @vitest-environment jsdom
/**
 * Pruebas de los hooks de reportes con react-query de verdad y la API como
 * mock. Lo que importa: la tendencia y la gráfica de ahorro terminan la
 * ventana en el mes que se está mirando (`until`), cada mes elegido es una
 * consulta distinta, y sin `until` el pedido va como siempre.
 */
import type { ReactNode } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ tendencia: vi.fn(), ahorro: vi.fn() }));

vi.mock("@/lib/api/reports", () => ({
  fetchCurrencies: vi.fn(),
  fetchSummary: vi.fn(),
  fetchByCategory: vi.fn(),
  fetchTrend: (...args: unknown[]) => api.tendencia(...args),
  fetchSavingsTrend: (...args: unknown[]) => api.ahorro(...args),
}));

import { clavesReportes, useAhorroMensual, useTendencia } from "./use-reportes";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function montar(children: ReactNode) {
  const cliente = new QueryClient();
  return render(
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
}

function SondaTendencia({ until }: { until?: string }) {
  useTendencia({ months: 6, currency: "COP", until });
  return <div />;
}

function SondaAhorro({ until }: { until?: string }) {
  useAhorroMensual({ months: 6, currency: "COP", until });
  return <div />;
}

describe("useTendencia: la ventana termina en el mes elegido", () => {
  it("con until lo manda en el pedido", async () => {
    api.tendencia.mockResolvedValue({ data: [] });
    montar(<SondaTendencia until="2026-08" />);

    await waitFor(() =>
      expect(api.tendencia).toHaveBeenCalledWith({ months: 6, currency: "COP", until: "2026-08" })
    );
  });

  it("sin until el pedido no lleva until (el default del servidor es hoy)", async () => {
    api.tendencia.mockResolvedValue({ data: [] });
    montar(<SondaTendencia until={undefined} />);

    await waitFor(() =>
      expect(api.tendencia).toHaveBeenCalledWith({ months: 6, currency: "COP", until: undefined })
    );
  });

  it("cada mes elegido es una consulta distinta de caché", () => {
    const llaves = [
      clavesReportes.tendencia({ months: 6, currency: "COP" }),
      clavesReportes.tendencia({ months: 6, currency: "COP", until: "2026-08" }),
      clavesReportes.tendencia({ months: 6, currency: "COP", until: "2026-09" }),
    ];
    expect(new Set(llaves.map((llave) => JSON.stringify(llave))).size).toBe(3);
  });
});

describe("useAhorroMensual: la ventana termina en el mes elegido", () => {
  it("con until lo manda en el pedido", async () => {
    api.ahorro.mockResolvedValue({ data: [] });
    montar(<SondaAhorro until="2026-08" />);

    await waitFor(() =>
      expect(api.ahorro).toHaveBeenCalledWith({ months: 6, currency: "COP", until: "2026-08" })
    );
  });

  it("sin until el pedido no lleva until", async () => {
    api.ahorro.mockResolvedValue({ data: [] });
    montar(<SondaAhorro until={undefined} />);

    await waitFor(() =>
      expect(api.ahorro).toHaveBeenCalledWith({ months: 6, currency: "COP", until: undefined })
    );
  });

  it("cada mes elegido es una consulta distinta de caché", () => {
    const llaves = [
      clavesReportes.ahorro({ months: 6, currency: "COP" }),
      clavesReportes.ahorro({ months: 6, currency: "COP", until: "2026-08" }),
      clavesReportes.ahorro({ months: 6, currency: "COP", until: "2026-09" }),
    ];
    expect(new Set(llaves.map((llave) => JSON.stringify(llave))).size).toBe(3);
  });
});
