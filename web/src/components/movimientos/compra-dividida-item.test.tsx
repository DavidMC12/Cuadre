// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { CompraDivididaItem } from "./compra-dividida-item";
import type { Categoria, Cuenta, Movimiento } from "@/lib/api/types";
import type { CompraDividida } from "@/lib/combinar-pagos-divididos";

type ConHijos = { children?: ReactNode };

// El Drawer de Base UI no hace falta para revisar el contenido: con este
// reemplazo queda montado.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children, open }: ConHijos & { open?: boolean }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerHeader: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerTitle: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerDescription: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerFooter: ({ children }: ConHijos) => <div>{children}</div>,
}));
vi.mock("@/components/movimientos/editar-categoria-movimiento", () => ({
  EditarCategoriaMovimiento: ({ children }: { children?: ReactElement }) => children ?? null,
}));
vi.mock("@/components/movimientos/editar-item-movimiento", () => ({
  EditarItemMovimiento: ({ children }: { children?: ReactElement }) => children ?? null,
}));

const { soloMirar } = vi.hoisted(() => ({ soloMirar: { valor: false } }));
vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => soloMirar.valor }));
vi.mock("@/hooks/use-presupuesto", () => ({
  usePresupuestoItems: () => ({
    data: [{ id: "i-1", label: "Mercado", categoryName: "Comida", accountName: null }],
  }),
}));

afterEach(() => {
  cleanup();
  soloMirar.valor = false;
});

function parte(extras: Partial<Movimiento>): Movimiento {
  return {
    id: "p1",
    accountId: "tarjeta",
    categoryId: "c-1",
    budgetItemId: "i-1",
    paymentGroupId: "g-1",
    kind: "standard",
    amount: "-100000.0000",
    currency: "COP",
    occurredAt: "2026-10-05T17:00:00Z",
    description: "Mercado (1 de 2)",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
    ...extras,
  };
}

const cuentas = new Map<string, Cuenta>([
  ["tarjeta", { id: "tarjeta", name: "Tarjeta Nu" } as Cuenta],
  ["banco", { id: "banco", name: "Nu Bank" } as Cuenta],
]);
const comida = { id: "c-1", name: "Comida" } as Categoria;

function compra(extras: { a?: Partial<Movimiento>; b?: Partial<Movimiento> } = {}): CompraDividida {
  return {
    tipo: "compra-dividida",
    paymentGroupId: "g-1",
    partes: [
      parte(extras.a ?? {}),
      parte({
        id: "p2",
        accountId: "banco",
        description: "Mercado (2 de 2)",
        amount: "-100000.0000",
        ...(extras.b ?? {}),
      }),
    ],
  };
}

function montar(c: CompraDividida, alAnular = vi.fn()) {
  render(
    <CompraDivididaItem
      compra={c}
      cuentasPorId={cuentas}
      categoria={comida}
      onSolicitarAnular={alAnular}
    />
  );
  return alAnular;
}

describe("CompraDivididaItem: la fila", () => {
  it("es UNA fila con la descripción sin la marca, el total y con qué se pagó", () => {
    montar(compra());

    const fila = screen.getByRole("button", { name: /Mercado/ });
    expect(fila).toHaveTextContent("Mercado");
    expect(fila).not.toHaveTextContent("1 de 2");
    expect(fila).toHaveTextContent("$200.000");
    expect(fila).toHaveTextContent("Tarjeta Nu $100.000 + Nu Bank $100.000");
    expect(fila).toHaveTextContent("Comida");
  });

  it("una compra anulada se marca 'Anulada'", () => {
    montar(compra({ a: { reversedByTransactionId: "r1" }, b: { reversedByTransactionId: "r2" } }));

    expect(screen.getByRole("button", { name: /Mercado/ })).toHaveTextContent("Anulada");
  });

  it("la fila de la anulación se marca 'Anulación'", () => {
    montar(
      compra({
        a: { reversesTransactionId: "p1", description: "Anulación de: Mercado (1 de 2)" },
        b: { reversesTransactionId: "p2", description: "Anulación de: Mercado (2 de 2)" },
      })
    );

    expect(screen.getByRole("button", { name: /Anulación de: Mercado/ })).toHaveTextContent(
      "Anulación"
    );
  });
});

describe("CompraDivididaItem: el detalle", () => {
  function abrir() {
    fireEvent.click(screen.getByRole("button", { name: /Mercado/ }));
  }

  it("muestra las dos partes, la categoría y el ítem al que cuenta", () => {
    montar(compra());
    abrir();

    expect(screen.getByText("Pagada con dos cuentas")).toBeInTheDocument();
    const partes = screen.getAllByRole("listitem");
    expect(partes).toHaveLength(2);
    expect(partes[0]).toHaveTextContent("Tarjeta Nu");
    expect(partes[1]).toHaveTextContent("Nu Bank");
    expect(screen.getByText("Cuenta para")).toBeInTheDocument();
    expect(screen.getAllByText("Mercado").length).toBeGreaterThan(0);
  });

  it("'Anular compra' pide anular la compra completa (con una de sus partes) y mide 44px", () => {
    const alAnular = montar(compra());
    abrir();

    const boton = screen.getByRole("button", { name: "Anular compra" });
    expect(boton.className).toContain("min-h-11");
    fireEvent.click(boton);

    expect(alAnular).toHaveBeenCalledTimes(1);
    expect(alAnular.mock.calls[0]![0]).toMatchObject({ paymentGroupId: "g-1" });
  });

  it("una compra ya anulada no ofrece anular otra vez", () => {
    montar(compra({ a: { reversedByTransactionId: "r1" }, b: { reversedByTransactionId: "r2" } }));
    abrir();

    expect(screen.queryByRole("button", { name: "Anular compra" })).not.toBeInTheDocument();
  });

  it("en la cuenta de otra persona (solo mirar) no hay acciones", () => {
    soloMirar.valor = true;
    montar(compra());
    abrir();

    expect(screen.queryByRole("button", { name: "Anular compra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cambiar/ })).not.toBeInTheDocument();
  });

  it("sin categoría no hay 'Cambiar ítem' (el ítem cuelga de la categoría)", () => {
    montar(compra({ a: { categoryId: null, budgetItemId: null }, b: { categoryId: null, budgetItemId: null } }));
    abrir();

    expect(screen.queryByRole("button", { name: /Cambiar ítem/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cambiar categoría/ })).toBeInTheDocument();
  });
});
