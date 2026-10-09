// @vitest-environment jsdom
/**
 * La transición completa de una escritura de dinero, con el Drawer y el
 * diálogo REALES (los demás archivos los mockean planos, como sus vecinas):
 * tocar la fila abre el cajón, "Anular transferencia" lo cierra y el diálogo
 * ConfirmarAnulacion toma su lugar con la transferencia correcta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import { TransferenciaItem } from "./transferencia-item";
import { ConfirmarAnulacion } from "./confirmar-anulacion";
import type { Cuenta, Movimiento } from "@/lib/api/types";
import type { ParDeTransferencia } from "@/lib/combinar-transferencias";

// Los Select no hacen falta para esta transición; los Selects reales quedan
// fuera del camino (el detalle no cambia categoría ni ítem).
const { soloMirar } = vi.hoisted(() => ({ soloMirar: { valor: false } }));
vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => soloMirar.valor }));
vi.mock("@/hooks/use-presupuesto", () => ({ usePresupuestoItems: () => ({ data: [] }) }));

afterEach(() => {
  cleanup();
  soloMirar.valor = false;
});

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
  salida: pata({ id: "salida", accountId: "banco", amount: "-100000.0000" }),
  entrada: pata({ id: "entrada", accountId: "efectivo", amount: "100000.0000" }),
};

const cuentas = new Map<string, Cuenta>([
  ["banco", { id: "banco", name: "Bancolombia" } as Cuenta],
  ["efectivo", { id: "efectivo", name: "Efectivo" } as Cuenta],
]);

/** La página en pequeño: la fila (cajón real) y la confirmación (diálogo real). */
function Shell({ parDeLaFila }: { parDeLaFila: ParDeTransferencia }) {
  const [aConfirmar, setAConfirmar] = useState<Movimiento | null>(null);
  return (
    <>
      <TransferenciaItem
        par={parDeLaFila}
        cuentaOrigen={cuentas.get(parDeLaFila.salida.accountId)}
        cuentaDestino={cuentas.get(parDeLaFila.entrada.accountId)}
        onSolicitarAnular={(parRecibido) => setAConfirmar(parRecibido.salida)}
      />
      <ConfirmarAnulacion
        movimiento={aConfirmar}
        procesando={false}
        onConfirmar={vi.fn()}
        onCancelar={() => setAConfirmar(null)}
      />
    </>
  );
}

describe("Anular transferencia: del cajón al diálogo (integración)", () => {
  it("abra el cajón al tocar la fila y 'Anular transferencia' deja el diálogo en su lugar", async () => {
    render(<Shell parDeLaFila={par} />);

    fireEvent.click(screen.getByRole("button", { name: /Pago tarjeta/ }));
    await waitFor(() => expect(screen.getByText("De una cuenta a otra")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Anular transferencia" }));

    // El cajón se cierra y el diálogo reutilizado toma su lugar, ya sabiendo
    // de qué transferencia se trata.
    await waitFor(() =>
      expect(screen.queryByText("De una cuenta a otra")).not.toBeInTheDocument()
    );
    expect(screen.getByText("¿Anular la transferencia?")).toBeInTheDocument();
    expect(screen.getByText(/la plata vuelve a su cuenta de origen/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sí, anular la transferencia" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sí, anular" })).not.toBeInTheDocument();
  });
});
