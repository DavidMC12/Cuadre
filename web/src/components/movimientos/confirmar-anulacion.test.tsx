// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { ConfirmarAnulacion } from "./confirmar-anulacion";
import type { Movimiento } from "@/lib/api/types";

afterEach(cleanup);

const movimiento: Movimiento = {
  id: "m-1",
  accountId: "a-1",
  categoryId: null,
  kind: "standard",
  amount: "-12500",
  currency: "COP",
  occurredAt: "2026-09-10T12:00:00Z",
  description: "Mercado",
  transferGroupId: null,
  budgetItemId: null,
  paymentGroupId: null,
  reversesTransactionId: null,
  reversedByTransactionId: null,
};

describe("ConfirmarAnulacion: los botones del diálogo llevan el piso de toque", () => {
  it("'Cancelar' y 'Sí, anular' miden 44px", () => {
    // Eran Button de 32px (h-8) en el pie del diálogo de confirmación.
    render(
      <ConfirmarAnulacion
        movimiento={movimiento}
        procesando={false}
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Cancelar" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Sí, anular" }).className).toContain("min-h-11");
  });
});

describe("ConfirmarAnulacion: una compra pagada con dos cuentas", () => {
  const parte1: Movimiento = {
    ...movimiento,
    id: "p1",
    paymentGroupId: "g-1",
    amount: "-100000.0000",
    description: "Mercado (1 de 2)",
  };
  const parte2: Movimiento = {
    ...parte1,
    id: "p2",
    accountId: "a-2",
    description: "Mercado (2 de 2)",
  };

  function montar(partes: Movimiento[] | undefined, movimientoAConfirmar: Movimiento = parte1) {
    render(
      <ConfirmarAnulacion
        movimiento={movimientoAConfirmar}
        partesDeLaCompra={partes}
        procesando={false}
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />
    );
  }

  it("dice que se anula la compra COMPLETA, con su total y sin la marca '(1 de 2)'", () => {
    montar([parte1, parte2]);

    expect(screen.getByText("¿Anular la compra completa?")).toBeInTheDocument();
    expect(screen.getByText(/se anulan las dos partes juntas/)).toBeInTheDocument();
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.getByText(/200\.000/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí, anular la compra" }).className).toContain(
      "min-h-11"
    );
  });

  it("con una sola parte a la vista NO promete un total: muestra esa parte, dicha como tal", () => {
    // Filtro por cuenta o paginación: la otra parte no llegó. Mostrar "$100.000"
    // como si fuera la compra sería engañar justo antes de anular $200.000.
    montar([parte1]);

    expect(screen.getByText("¿Anular la compra completa?")).toBeInTheDocument();
    expect(screen.getByText(/Mercado · una de las dos partes/)).toBeInTheDocument();
    expect(screen.getByText(/100\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/200\.000/)).not.toBeInTheDocument();
    expect(screen.getByText(/se anulan las dos partes juntas/)).toBeInTheDocument();
  });

  it("con las dos partes a la vista sí muestra el total y no dice 'una de las dos partes'", () => {
    montar([parte1, parte2]);

    expect(screen.queryByText(/una de las dos partes/)).not.toBeInTheDocument();
  });

  it("un movimiento normal sigue diciendo lo de siempre", () => {
    montar(undefined, movimiento);

    expect(screen.getByText("¿Anular este movimiento?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí, anular" })).toBeInTheDocument();
  });
});

describe("ConfirmarAnulacion: una transferencia entre cuentas", () => {
  const pataSalida: Movimiento = {
    ...movimiento,
    id: "salida",
    accountId: "a-1",
    kind: "transfer",
    transferGroupId: "tg-1",
    amount: "-100000.0000",
    description: "Pago tarjeta",
  };
  const pataEntrada: Movimiento = {
    ...pataSalida,
    id: "entrada",
    accountId: "a-2",
    amount: "100000.0000",
  };

  function montarTransferencia(movimientoAConfirmar: Movimiento = pataSalida) {
    render(
      <ConfirmarAnulacion
        movimiento={movimientoAConfirmar}
        procesando={false}
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />
    );
  }

  it("dice que se anula la transferencia COMPLETA y que la plata vuelve a su cuenta de origen", () => {
    montarTransferencia();

    expect(screen.getByText("¿Anular la transferencia?")).toBeInTheDocument();
    expect(screen.getByText(/la plata vuelve a su cuenta de origen/)).toBeInTheDocument();
    expect(screen.getByText("Pago tarjeta")).toBeInTheDocument();
    // El monto sin signo: una transferencia ni entra ni sale.
    expect(screen.getByText(/\$100\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/−|\+/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sí, anular la transferencia" }).className
    ).toContain("min-h-11");
  });

  it("con una sola pata a la vista el monto no engaña: es el mismo en las dos", () => {
    // A diferencia de la compra dividida (el total es la suma), en una
    // transferencia las dos patas llevan el mismo valor; el diálogo solo
    // necesita la pata que confirmó. La de entrada (positiva) dice igual.
    montarTransferencia();

    expect(screen.getByText("¿Anular la transferencia?")).toBeInTheDocument();
    expect(screen.getByText(/\$100\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/una de las dos partes/)).not.toBeInTheDocument();

    cleanup();
    montarTransferencia(pataEntrada);
    expect(screen.getByText("¿Anular la transferencia?")).toBeInTheDocument();
    expect(screen.getByText(/\$100\.000/)).toBeInTheDocument();
  });

  it("sin descripción la fila dice 'Transferencia'", () => {
    montarTransferencia({
      ...pataSalida,
      description: null,
    });

    expect(screen.getByText("Transferencia")).toBeInTheDocument();
  });
});
