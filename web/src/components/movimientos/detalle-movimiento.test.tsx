// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

vi.mock("@/components/movimientos/editar-item-movimiento", () => ({
  EditarItemMovimiento: ({ children }: { children?: ReactElement }) => children ?? null,
}));

vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => false }));

vi.mock("@/hooks/use-presupuesto", () => ({
  usePresupuestoItems: vi.fn(() => ({ data: [] })),
}));

afterEach(cleanup);

const movimiento: Movimiento = {
  id: "m-1",
  accountId: "a-1",
  categoryId: null,
  budgetItemId: null,
  paymentGroupId: null,
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
    paymentGroupId: null,
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

// -------------------------------------------------------------------------
// El item del presupuesto: a qué cuenta el movimiento
// -------------------------------------------------------------------------

import { usePresupuestoItems } from "@/hooks/use-presupuesto";
import { ItemPresupuesto } from "@/lib/api/types";

function conCatalogo(items: ItemPresupuesto[]) {
  vi.mocked(usePresupuestoItems).mockImplementation(() => ({ data: items }) as never);
}

const itemDeuda: ItemPresupuesto = {
  id: "i-nu",
  kind: "category",
  currency: "COP",
  categoryId: "c-deu",
  categoryName: "Deudas",
  categoryKind: "expense",
  accountId: null,
  accountName: null,
  label: "Deuda TC Nu",
  currentAmount: "250000",
  archivedAt: null,
};

describe("DetalleMovimiento: el renglón del item del presupuesto", () => {
  it("un movimiento con categoría dice a qué item cuenta (Cuenta para: Deuda TC Nu)", () => {
    conCatalogo([itemDeuda]);
    render(
      <DetalleMovimiento
        movimiento={{ ...movimiento, categoryId: "c-deu", budgetItemId: "i-nu" }}
        cuenta={undefined}
        categoria={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );

    expect(screen.getByText("Cuenta para")).toBeInTheDocument();
    expect(screen.getByText("Deuda TC Nu")).toBeInTheDocument();
  });

  it("sin item dice Sin asignar, con la voz apagada", () => {
    conCatalogo([itemDeuda]);
    render(
      <DetalleMovimiento
        movimiento={{ ...movimiento, categoryId: "c-deu", budgetItemId: null }}
        cuenta={undefined}
        categoria={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );

    const sinAsignar = screen.getByText("Sin asignar");
    expect(sinAsignar.className).toContain("text-muted-foreground");
  });

  it("si el catálogo no ha cargado, muestra el id deshojado y no un nombre falso", () => {
    // Sin datos, el renglón sigue siendo honesto: nunca inventa un nombre.
    conCatalogo([]);
    render(
      <DetalleMovimiento
        movimiento={{ ...movimiento, categoryId: "c-deu", budgetItemId: "i-nu" }}
        cuenta={undefined}
        categoria={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );

    expect(screen.getByText("i-nu")).toBeInTheDocument();
    expect(screen.queryByText("Deuda TC Nu")).not.toBeInTheDocument();
  });

  it("un movimiento sin categoría no muestra el renglón ni el botón (no se puede asignar)", () => {
    conCatalogo([itemDeuda]);
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

    expect(screen.queryByText("Cuenta para")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cambiar ítem/ })).not.toBeInTheDocument();
  });

  it("un saldo inicial no muestra el item ni el botón", () => {
    conCatalogo([itemDeuda]);
    render(
      <DetalleMovimiento
        movimiento={{ ...movimiento, kind: "opening" }}
        cuenta={undefined}
        categoria={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );

    expect(screen.queryByText("Cuenta para")).not.toBeInTheDocument();
  });

  it("un ajuste sigue sin mostrar el item (el servidor lo rechazaría)", () => {
    conCatalogo([itemDeuda]);
    render(
      <DetalleMovimiento
        movimiento={{
          ...movimiento,
          kind: "adjustment",
          categoryId: "c-deu",
          budgetItemId: null,
          paymentGroupId: null,
        }}
        cuenta={undefined}
        categoria={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );

    expect(screen.queryByText("Cuenta para")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cambiar ítem/ })).not.toBeInTheDocument();
  });

  it("una pata de transferencia sí puede cambiar el item (el servidor acepta cualquiera de las dos)", () => {
    conCatalogo([itemDeuda]);
    render(
      <DetalleMovimiento
        movimiento={{ ...movimiento, categoryId: null, kind: "transfer", budgetItemId: "i-nu" }}
        cuenta={undefined}
        categoria={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );

    expect(screen.getByText("Cuenta para")).toBeInTheDocument();
    // En transferencia no hay categoría que mostrar (no la lleva), pero el
    // cambio de item sí.
    expect(screen.getByRole("button", { name: /Cambiar ítem/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cambiar categoría/ })).not.toBeInTheDocument();
  });

  it("el botón Cambiar ítem lleva el piso de toque de 44px", () => {
    conCatalogo([itemDeuda]);
    render(
      <DetalleMovimiento
        movimiento={{ ...movimiento, categoryId: "c-deu", budgetItemId: "i-nu" }}
        cuenta={undefined}
        categoria={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /Cambiar ítem/ }).className
    ).toContain("min-h-11");
  });
});

describe("DetalleMovimiento: una parte suelta de una compra pagada con dos cuentas", () => {
  it("el botón dice 'Anular compra completa' y pide anular ESA parte (la página anula el grupo)", () => {
    const alAnular = vi.fn();
    const parte: Movimiento = {
      ...movimiento,
      paymentGroupId: "g-1",
      description: "Mercado (1 de 2)",
    };
    render(
      <DetalleMovimiento
        movimiento={parte}
        cuenta={undefined}
        categoria={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={alAnular}
      />
    );

    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
    const boton = screen.getByRole("button", { name: "Anular compra completa" });
    expect(boton.className).toContain("min-h-11");
    fireEvent.click(boton);

    expect(alAnular).toHaveBeenCalledWith(parte);
  });
});
