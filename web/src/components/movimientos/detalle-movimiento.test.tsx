// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { DetalleMovimiento } from "./detalle-movimiento";
import { MENOS } from "@/lib/money";
import type { Movimiento } from "@/lib/api/types";

type ConHijos = { children?: ReactNode };

// El Drawer de Base UI no hace falta para revisar el pie: con este reemplazo
// el contenido queda montado.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerContent: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerHeader: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerTitle: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerDescription: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerFooter: ({ children }: ConHijos) => <div>{children}</div>,
}));

vi.mock("@/components/movimientos/editar-categoria-movimiento", () => ({
  EditarCategoriaMovimiento: ({ children }: { children?: ReactElement }) => children ?? null,
}));

vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => false }));

afterEach(cleanup);

const movimiento: Movimiento = {
  id: "m-1",
  accountId: "a-1",
  categoryId: null,
  budgetItemId: null,
  kind: "standard",
  amount: "-12500",
  currency: "COP",
  occurredAt: "2026-09-10T12:00:00Z",
  description: "Mercado",
  transferGroupId: null,
  reversesTransactionId: null,
  reversedByTransactionId: null,
};

describe("DetalleMovimiento: los botones del pie llevan el piso de toque", () => {
  it("'Cambiar categoría' y 'Anular' miden 44px", () => {
    // Eran Button de 32px (h-8) en el pie del cajón.
    render(
      <DetalleMovimiento
        movimiento={movimiento}
        cuenta={undefined}
        categoria={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /Cambiar categoría/ }).className
    ).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Anular" }).className).toContain("min-h-11");
  });
});

describe("DetalleMovimiento: un ajuste de saldo", () => {
  const ajuste: Movimiento = {
    id: "m-2",
    accountId: "a-1",
    categoryId: null,
    kind: "adjustment",
    amount: "100000.0000",
    currency: "COP",
    occurredAt: "2026-10-06T18:30:00Z",
    description: "Ajuste de saldo",
    transferGroupId: null,
    budgetItemId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
  };

  function renderDetalleAjuste(monto: string = ajuste.amount) {
    render(
      <DetalleMovimiento
        movimiento={{ ...ajuste, amount: monto }}
        cuenta={undefined}
        categoria={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );
  }

  it("se llama 'Ajuste de saldo' y explica en palabras qué es", () => {
    renderDetalleAjuste();

    expect(screen.getByText("Ajuste de saldo")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Es un ajuste para que el saldo coincida con tu banco. No cuenta como gasto ni ingreso. Si quedó mal, haz otro ajuste."
      )
    ).toBeInTheDocument();
  });

  it("no ofrece anular ni cambiar categoría", () => {
    renderDetalleAjuste();

    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cambiar categoría/ })).not.toBeInTheDocument();
  });

  it("no muestra renglón de categoría", () => {
    renderDetalleAjuste();

    expect(screen.queryByText("Categoría")).not.toBeInTheDocument();
  });

  it("el signo del ajuste se dice, no solo el color", () => {
    renderDetalleAjuste("100000.0000");
    expect(screen.getByText("+$100.000")).toBeInTheDocument();

    cleanup();
    renderDetalleAjuste("-250000.0000");
    expect(screen.getByText(`${MENOS}$250.000`)).toBeInTheDocument();
  });
});
