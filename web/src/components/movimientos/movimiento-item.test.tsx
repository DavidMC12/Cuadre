// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { MovimientoItem } from "./movimiento-item";
import type { Categoria, Cuenta, Movimiento } from "@/lib/api/types";
import { type CatalogoDeItems, resolverCatalogoDeItems } from "@/lib/item-en-la-fila";

type ConHijos = { children?: ReactNode };

// El Drawer de Base UI no hace falta para revisar la fila: con este reemplazo
// queda montado solo cuando está abierto.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children, open }: ConHijos & { open?: boolean }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerHeader: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerTitle: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerDescription: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerFooter: ({ children }: ConHijos) => <div>{children}</div>,
}));

const { soloMirar } = vi.hoisted(() => ({ soloMirar: { valor: false } }));
vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => soloMirar.valor }));
// El detalle (siempre montado) usa el catálogo; la fila recibe el suyo aparte.
vi.mock("@/hooks/use-presupuesto", () => ({
  usePresupuestoItems: () => ({
    data: [{ id: "i-nu", label: "Deuda TC Nu", categoryName: "Deudas", accountName: null }],
  }),
}));

afterEach(() => {
  cleanup();
  soloMirar.valor = false;
});

function movimiento(extras: Partial<Movimiento> = {}): Movimiento {
  return {
    id: "m-1",
    accountId: "banco",
    categoryId: "c-deu",
    budgetItemId: null,
    paymentGroupId: null,
    kind: "standard",
    amount: "-12500.0000",
    currency: "COP",
    occurredAt: "2026-09-10T15:30:00Z",
    description: "Cuota",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
    ...extras,
  };
}

/** El catálogo ya resuelto que la lista le pasa a la fila. */
const catalogoConItem: CatalogoDeItems = resolverCatalogoDeItems([
  {
    id: "i-nu",
    kind: "category",
    currency: "COP",
    categoryId: "c-deu",
    categoryName: "Deudas",
    categoryKind: "expense",
    accountId: null,
    accountName: null,
    label: "Deuda TC Nu",
    currentAmount: null,
    archivedAt: null,
  },
])!;

const deudas = { id: "c-deu", name: "Deudas" } as Categoria;
const otra = { id: "c-otra", name: "Otra" } as Categoria;
const banco = { id: "banco", name: "Bancolombia" } as Cuenta;

function montar({
  movimiento: mov = movimiento(),
  categoria = deudas,
  catalogo = null,
  mostrarCuenta = true,
}: {
  movimiento?: Movimiento;
  categoria?: Categoria | undefined;
  catalogo?: CatalogoDeItems | null;
  mostrarCuenta?: boolean;
} = {}) {
  render(
    <MovimientoItem
      movimiento={mov}
      cuenta={banco}
      categoria={categoria}
      catalogo={catalogo}
      mostrarCuenta={mostrarCuenta}
      onSolicitarAnular={vi.fn()}
    />
  );
  return screen.getByRole("button", { name: /Cuota/ });
}

describe("MovimientoItem: la fila", () => {
  it("blinda el piso táctil de 44px con min-h-11", () => {
    const fila = montar();
    expect(fila.className).toContain("min-h-11");
  });
});

describe("MovimientoItem: el ítem en la línea de detalle", () => {
  it("con ítem dice 'Categoría › Ítem · Cuenta · Hora'", () => {
    const fila = montar({ movimiento: movimiento({ budgetItemId: "i-nu" }), catalogo: catalogoConItem });
    expect(fila).toHaveTextContent("Deudas › Deuda TC Nu · Bancolombia");
  });

  it("sin ítem y con una categoría que tiene ítems, marca 'Sin asignar'", () => {
    const fila = montar({ catalogo: catalogoConItem });
    expect(fila).toHaveTextContent("Deudas · Sin asignar · Bancolombia");
  });

  it("sin ítem y con una categoría sin ítems queda como hoy", () => {
    const fila = montar({
      movimiento: movimiento({ categoryId: "c-otra" }),
      categoria: otra,
      catalogo: catalogoConItem,
    });
    expect(fila).toHaveTextContent("Otra · Bancolombia");
    expect(fila).not.toHaveTextContent("Sin asignar");
  });

  it("mientras el catálogo carga o falla (null) queda como hoy", () => {
    const fila = montar({ movimiento: movimiento({ budgetItemId: "i-nu" }), catalogo: null });
    expect(fila).toHaveTextContent("Deudas · Bancolombia");
    expect(fila).not.toHaveTextContent("Deuda TC Nu");
    expect(fila).not.toHaveTextContent("Sin asignar");
  });

  it("no marca 'Sin asignar' en un saldo inicial, un ajuste, un anulado ni una anulación", () => {
    for (const kind of ["opening", "adjustment"] as const) {
      cleanup();
      const fila = montar({ movimiento: movimiento({ kind }), catalogo: catalogoConItem });
      expect(fila).not.toHaveTextContent("Sin asignar");
    }
    cleanup();
    expect(
      montar({
        movimiento: movimiento({ reversedByTransactionId: "m-2" }),
        catalogo: catalogoConItem,
      })
    ).not.toHaveTextContent("Sin asignar");
    cleanup();
    expect(
      montar({
        movimiento: movimiento({ reversesTransactionId: "m-1" }),
        catalogo: catalogoConItem,
      })
    ).not.toHaveTextContent("Sin asignar");
  });

  it("no marca 'Sin asignar' en una transferencia sin ítem", () => {
    const fila = montar({
      movimiento: movimiento({ kind: "transfer", categoryId: null, transferGroupId: "tg-1" }),
      categoria: undefined,
      catalogo: catalogoConItem,
    });
    expect(fila).not.toHaveTextContent("Sin asignar");
  });

  it("sin cuenta visible, la línea va categoría y hora", () => {
    const fila = montar({ catalogo: catalogoConItem, mostrarCuenta: false });
    expect(fila).toHaveTextContent("Deudas · Sin asignar");
    expect(fila).not.toHaveTextContent("Bancolombia");
  });
});
