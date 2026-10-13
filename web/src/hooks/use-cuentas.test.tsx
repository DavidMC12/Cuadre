// @vitest-environment jsdom
/**
 * Pruebas del hook de cuentas con react-query de verdad y la API como mock.
 * Lo que importa aquí: la lista de un mes pasado es OTRO pedido con OTRO
 * contenido de caché, mientras carga no la suplanta la lista de hoy (nada de
 * keepPreviousData ni placeholder: un saldo de otro mes pintado como si
 * fuera el del mes elegido es peor que un esqueleto), y las invalidaciones
 * por prefijo —las que hacen las mutaciones con clavesCuentas.todas()—
 * alcanzan a la lista con mes igual que a la de hoy.
 */
import { useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ cuentas: vi.fn() }));

vi.mock("@/lib/api/accounts", () => ({
  adjustAccountBalance: vi.fn(),
  archiveAccount: vi.fn(),
  createAccount: vi.fn(),
  fetchAccounts: (...args: unknown[]) => api.cuentas(...args),
  fetchAccount: vi.fn(),
  unarchiveAccount: vi.fn(),
  updateAccount: vi.fn(),
  updateAccountSavings: vi.fn(),
}));

import { clavesCuentas, useCuentas } from "./use-cuentas";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function montar(sonda: ReactNode) {
  const cliente = new QueryClient();
  return render(<QueryClientProvider client={cliente}>{sonda}</QueryClientProvider>);
}

function Sonda({ mes }: { mes?: string }) {
  const consulta = useCuentas(false, mes);
  return (
    <div>
      <span data-testid="estado">{consulta.isLoading ? "cargando" : "listo"}</span>
      <span data-testid="saldo">{consulta.data?.[0]?.balance ?? ""}</span>
    </div>
  );
}

function SondaConBoton() {
  const [mes, setMes] = useState<string | undefined>(undefined);
  const consulta = useCuentas(false, mes);
  return (
    <div>
      <button type="button" onClick={() => setMes("2026-08")}>
        ir a agosto
      </button>
      <span data-testid="estado">{consulta.isLoading ? "cargando" : "listo"}</span>
      <span data-testid="saldo">{consulta.data?.[0]?.balance ?? ""}</span>
    </div>
  );
}

describe("useCuentas: la llave y el pedido según el mes", () => {
  it("sin mes es la lista de hoy: el pedido de cuentas no lleva month", async () => {
    api.cuentas.mockResolvedValue({ data: [] });
    montar(<Sonda mes={undefined} />);

    await waitFor(() => expect(api.cuentas).toHaveBeenCalledWith(false, undefined));
  });

  it("con mes es otro pedido: fetchAccounts lleva el month de cierre", async () => {
    api.cuentas.mockResolvedValue({ data: [] });
    montar(<Sonda mes="2026-08" />);

    await waitFor(() => expect(api.cuentas).toHaveBeenCalledWith(false, "2026-08"));
  });

  it("la llave de caché separa el mes elegido de la lista de hoy", () => {
    expect(clavesCuentas.lista(false, "2026-08")).not.toEqual(clavesCuentas.lista(false));
    // Y cuelga del prefijo compartido: las mutaciones invalidan con
    // clavesCuentas.todas() y deben refrescar también esta lista.
    expect(clavesCuentas.lista(false, "2026-08")[0]).toEqual(clavesCuentas.todas()[0]);
  });

  it("dos meses distintos no comparten caché entre sí ni con hoy", () => {
    const llaves = [
      clavesCuentas.lista(false),
      clavesCuentas.lista(false, "2026-07"),
      clavesCuentas.lista(false, "2026-08"),
    ];
    expect(new Set(llaves.map((llave) => JSON.stringify(llave))).size).toBe(3);
  });

  it("invalidar por prefijo (como hacen las mutaciones) relee el mes también", async () => {
    api.cuentas.mockResolvedValue({ data: [{ balance: "1" }] });
    const cliente = new QueryClient();
    render(
      <QueryClientProvider client={cliente}>
        <SondaDoble />
      </QueryClientProvider>
    );

    // Montadas a la vez: la lista de hoy y la del cierre de agosto.
    await waitFor(() => expect(api.cuentas).toHaveBeenCalledTimes(2));

    // La misma invalidación que dispara una mutación cualquiera.
    await act(async () => {
      await cliente.invalidateQueries({ queryKey: clavesCuentas.todas() });
    });

    // Las DOS se releen. Con la lista del mes pasado en caché, una mutación
    // (un movimiento nuevo, por ejemplo) la dejaría mintiendo sobre el
    // cierre: el prefijo compartido se lo garantiza.
    await waitFor(() => expect(api.cuentas).toHaveBeenCalledTimes(4));
  });
});

function SondaDoble() {
  useCuentas(false);
  useCuentas(false, "2026-08");
  return <div />;
}

describe("useCuentas: mientras carga el mes, nada del mes de hoy en pantalla", () => {
  it("al cambiar a un mes cuyo pedido sigue en vuelo, se ve cargando y NO el saldo de hoy", async () => {
    api.cuentas.mockResolvedValueOnce({ data: [{ balance: "1234567" }] });
    // Del segundo pedido en adelante el servidor no acaba de responder:
    // hay una respuesta colgada que soltamos a mano.
    let soltar: (respuesta: { data: { balance: string }[] }) => void = () => {};
    api.cuentas.mockImplementation(
      () =>
        new Promise((res) => {
          soltar = res;
        }) as ReturnType<typeof api.cuentas>
    );

    montar(<SondaConBoton />);

    // La lista de hoy llegó y se pinta…
    await waitFor(() => expect(screen.getByTestId("saldo")).toHaveTextContent("1234567"));

    // … elegimos un mes pasado cuyo pedido está en vuelo: la pantalla queda
    // cargando. Pintar el 1234567 de hoy como si fuera el cierre de agosto
    // sería exactamente lo que el dueño prohibió.
    fireEvent.click(screen.getByRole("button", { name: "ir a agosto" }));
    await waitFor(() => expect(screen.getByTestId("estado")).toHaveTextContent("cargando"));
    expect(screen.getByTestId("saldo")).toBeEmptyDOMElement();

    // Llega la respuesta del cierre y ahora sí: el saldo del mes.
    await act(async () => {
      soltar({ data: [{ balance: "999" }] });
    });
    await waitFor(() => expect(screen.getByTestId("saldo")).toHaveTextContent("999"));
  });
});
