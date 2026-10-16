// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";

import { DetalleTransferencia } from "./detalle-transferencia";
import type { ItemPresupuesto, Movimiento } from "@/lib/api/types";
import type { ParDeTransferencia } from "@/lib/combinar-transferencias";

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

vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => false }));

vi.mock("@/hooks/use-presupuesto", () => ({
  usePresupuestoItems: vi.fn(() => ({ data: [] })),
}));

import { usePresupuestoItems } from "@/hooks/use-presupuesto";

function conCatalogo(items: ItemPresupuesto[]) {
  vi.mocked(usePresupuestoItems).mockImplementation(() => ({ data: items }) as never);
}

afterEach(cleanup);

function pata(extras: Partial<Movimiento>): Movimiento {
  return {
    id: "salida",
    accountId: "banco",
    categoryId: null,
    budgetItemId: null,
    paymentGroupId: null,
    kind: "transfer",
    amount: "-100000.0000",
    currency: "COP",
    occurredAt: "2026-09-10T15:30:00Z",
    description: "Pago tarjeta",
    transferGroupId: "tg-1",
    reversesTransactionId: null,
    reversedByTransactionId: null,
    ...extras,
  };
}

const par: ParDeTransferencia = {
  tipo: "transferencia",
  transferGroupId: "tg-1",
  salida: pata({ id: "salida", budgetItemId: "i-nu" }),
  entrada: pata({ id: "entrada" }),
};

describe("DetalleTransferencia: el renglón del item del presupuesto", () => {
  it("si el catálogo no conoce el ítem, una frase neutra: nunca el id en pantalla", () => {
    // El ítem viaja en la pata de salida; sin nombre a la mano, el renglón es
    // "Ítem del presupuesto", no el id crudo ni "Sin asignar" (que mentiría).
    conCatalogo([]);
    render(
      <DetalleTransferencia
        par={par}
        cuentaOrigen={undefined}
        cuentaDestino={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );

    expect(screen.queryByText("i-nu")).not.toBeInTheDocument();
    expect(screen.getByText("Ítem del presupuesto")).toBeInTheDocument();
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
      <DetalleTransferencia
        par={par}
        cuentaOrigen={undefined}
        cuentaDestino={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );

    expect(screen.getByText("Deuda TC Nu")).toBeInTheDocument();
    expect(screen.queryByText("Ítem del presupuesto")).not.toBeInTheDocument();
  });
});
