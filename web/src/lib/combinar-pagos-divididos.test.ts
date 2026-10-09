import { describe, expect, it } from "vitest";

import type { Movimiento } from "./api/types";
import {
  combinarPagosDivididos,
  COMPRA_SIN_DESCRIPCION,
  compraAnulada,
  descripcionDeLaCompra,
  esAnulacionDeCompra,
  esCompraDividida,
  totalDeLaCompra,
} from "./combinar-pagos-divididos";

function movimiento(extras: Partial<Movimiento>): Movimiento {
  return {
    id: "m",
    accountId: "a",
    categoryId: "c",
    budgetItemId: null,
    paymentGroupId: null,
    kind: "standard",
    amount: "-1000.0000",
    currency: "COP",
    occurredAt: "2026-10-05T17:00:00Z",
    description: null,
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
    ...extras,
  };
}

const parte1 = movimiento({
  id: "p1",
  accountId: "tarjeta",
  paymentGroupId: "g1",
  amount: "-100000.0000",
  description: "Mercado (1 de 2)",
});
const parte2 = movimiento({
  id: "p2",
  accountId: "banco",
  paymentGroupId: "g1",
  amount: "-100000.5000",
  description: "Mercado (2 de 2)",
});

describe("combinarPagosDivididos", () => {
  it("une las dos partes en una fila, en el lugar de la primera", () => {
    const suelto = movimiento({ id: "x" });
    const resultado = combinarPagosDivididos([suelto, parte2, movimiento({ id: "y" }), parte1]);

    expect(resultado.map((item) => (esCompraDividida(item) ? "compra" : (item as Movimiento).id))).toEqual([
      "x",
      "compra",
      "y",
    ]);
    const compra = resultado[1]!;
    expect(esCompraDividida(compra) && compra.paymentGroupId).toBe("g1");
  });

  it("deja la marca '1 de 2' primero aunque lleguen al revés", () => {
    const [compra] = combinarPagosDivididos([parte2, parte1]);

    expect(esCompraDividida(compra!) && compra.partes.map((parte) => parte.id)).toEqual(["p1", "p2"]);
  });

  it("si solo llega una parte, la deja como movimiento normal", () => {
    const resultado = combinarPagosDivididos([parte1]);

    expect(resultado).toHaveLength(1);
    expect(esCompraDividida(resultado[0]!)).toBe(false);
  });

  it("no toca los movimientos sin grupo ni las transferencias", () => {
    const transferencia = movimiento({ id: "t", kind: "transfer", transferGroupId: "tg" });
    const resultado = combinarPagosDivididos([transferencia, movimiento({ id: "x" })]);

    expect(resultado.map((item) => (esCompraDividida(item) ? "compra" : (item as Movimiento).id))).toEqual([
      "t",
      "x",
    ]);
  });

  it("no confunde dos compras distintas", () => {
    const otra1 = movimiento({ id: "o1", paymentGroupId: "g2", description: "Cine (1 de 2)" });
    const otra2 = movimiento({ id: "o2", paymentGroupId: "g2", description: "Cine (2 de 2)" });

    const resultado = combinarPagosDivididos([parte1, otra1, parte2, otra2]);

    expect(resultado).toHaveLength(2);
    expect(resultado.every(esCompraDividida)).toBe(true);
  });

  it("reconoce la compra anulada y la fila de su anulación", () => {
    const anuladaA = { ...parte1, reversedByTransactionId: "r1" };
    const anuladaB = { ...parte2, reversedByTransactionId: "r2" };
    const [original] = combinarPagosDivididos([anuladaA, anuladaB]);
    const anulacionA = movimiento({
      id: "r1",
      paymentGroupId: "g9",
      reversesTransactionId: "p1",
      description: "Anulación de: Mercado (1 de 2)",
      amount: "100000.0000",
    });
    const anulacionB = { ...anulacionA, id: "r2", reversesTransactionId: "p2", description: "Anulación de: Mercado (2 de 2)" };
    const [anulacion] = combinarPagosDivididos([anulacionA, anulacionB]);

    expect(esCompraDividida(original!) && compraAnulada(original)).toBe(true);
    expect(esCompraDividida(original!) && esAnulacionDeCompra(original)).toBe(false);
    expect(esCompraDividida(anulacion!) && esAnulacionDeCompra(anulacion)).toBe(true);
  });
});

describe("descripcionDeLaCompra", () => {
  it("quita la marca '(1 de 2)' de la descripción", () => {
    expect(descripcionDeLaCompra([parte1, parte2])).toBe("Mercado");
  });

  it("sin descripción propia dice 'Compra pagada con dos cuentas'", () => {
    const sin = [
      movimiento({ description: "Pago 1 de 2" }),
      movimiento({ description: "Pago 2 de 2" }),
    ];

    expect(descripcionDeLaCompra(sin)).toBe(COMPRA_SIN_DESCRIPCION);
    expect(descripcionDeLaCompra([movimiento({ description: null })])).toBe(COMPRA_SIN_DESCRIPCION);
  });

  it("la anulación conserva su prefijo", () => {
    expect(
      descripcionDeLaCompra([movimiento({ description: "Anulación de: Mercado (1 de 2)" })]),
    ).toBe("Anulación de: Mercado");
    expect(
      descripcionDeLaCompra([movimiento({ description: "Anulación de: Pago 1 de 2" })]),
    ).toBe(`Anulación de: ${COMPRA_SIN_DESCRIPCION}`);
  });
});

describe("totalDeLaCompra", () => {
  it("suma exacto las dos partes con decimales", () => {
    expect(totalDeLaCompra([parte1, parte2])).toBe("-200000.5000");
  });
});
