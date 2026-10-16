// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { DetalleCompraDividida } from "./detalle-compra-dividida";
import type { ItemPresupuesto, Movimiento } from "@/lib/api/types";
import type { CompraDividida } from "@/lib/combinar-pagos-divididos";

type ConHijos = { children?: ReactNode };

// El Drawer de Base UI no hace falta para revisar el contenido: con este
// reemplazo queda montado.
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

import { usePresupuestoItems } from "@/hooks/use-presupuesto";

function conCatalogo(items: ItemPresupuesto[]) {
  vi.mocked(usePresupuestoItems).mockImplementation(() => ({ data: items }) as never);
}

afterEach(cleanup);

function parte(extras: Partial<Movimiento>): Movimiento {
  return {
    id: "p-1",
    accountId: "a-1",
    categoryId: "c-mer",
    budgetItemId: "i-nu",
    paymentGroupId: "g-1",
    kind: "standard",
    amount: "-62500",
    currency: "COP",
    occurredAt: "2026-09-10T12:00:00Z",
    description: "Mercado (1 de 2)",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
    ...extras,
  };
}

const compra: CompraDividida = {
  tipo: "compra-dividida",
  paymentGroupId: "g-1",
  partes: [
    parte({ id: "p-1" }),
    parte({ id: "p-2", accountId: "a-2", description: "Mercado (2 de 2)", amount: "-62500" }),
  ],
};

describe("DetalleCompraDividida: el renglón del item del presupuesto", () => {
  it("si el catálogo no conoce el ítem, una frase neutra: nunca el id en pantalla", () => {
    conCatalogo([]);
    render(
      <DetalleCompraDividida
        compra={compra}
        cuentasPorId={new Map()}
        categoria={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );

    expect(screen.queryByText("i-nu")).not.toBeInTheDocument();
    expect(screen.getByText("Ítem del presupuesto")).toBeInTheDocument();
    expect(screen.queryByText("Deuda TC Nu")).not.toBeInTheDocument();
  });

  it("con el catálogo en mano dice el nombre del ítem, no la frase neutra", () => {
    conCatalogo([
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
        currentAmount: "250000",
        archivedAt: null,
      },
    ]);
    render(
      <DetalleCompraDividida
        compra={compra}
        cuentasPorId={new Map()}
        categoria={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );

    expect(screen.getByText("Deuda TC Nu")).toBeInTheDocument();
    expect(screen.queryByText("Ítem del presupuesto")).not.toBeInTheDocument();
  });
});
