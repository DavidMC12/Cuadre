import { describe, expect, it } from "vitest";
import { combinarTransferencias, esTransferencia } from "./combinar-transferencias";
import type { Movimiento } from "./api/types";

function movimiento(datos: Partial<Movimiento> & Pick<Movimiento, "id">): Movimiento {
  return {
    accountId: "cuenta-1",
    categoryId: null,
    kind: "standard",
    amount: "-1000.0000",
    currency: "COP",
    occurredAt: "2026-09-05T17:00:00.000Z",
    description: null,
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
    ...datos,
  };
}

describe("combinarTransferencias", () => {
  it("une las dos patas de una transferencia en una sola fila", () => {
    const salida = movimiento({
      id: "salida",
      kind: "transfer",
      transferGroupId: "grupo-1",
      accountId: "banco",
      amount: "-300000.0000",
    });
    const entrada = movimiento({
      id: "entrada",
      kind: "transfer",
      transferGroupId: "grupo-1",
      accountId: "efectivo",
      amount: "300000.0000",
    });

    const resultado = combinarTransferencias([salida, entrada]);

    expect(resultado).toHaveLength(1);
    const [item] = resultado;
    expect(esTransferencia(item!)).toBe(true);
    if (esTransferencia(item!)) {
      expect(item.salida.id).toBe("salida");
      expect(item.entrada.id).toBe("entrada");
      expect(item.transferGroupId).toBe("grupo-1");
    }
  });

  it("no depende del orden en el que llegan las dos patas", () => {
    const salida = movimiento({
      id: "salida",
      kind: "transfer",
      transferGroupId: "grupo-1",
      amount: "-500.0000",
    });
    const entrada = movimiento({
      id: "entrada",
      kind: "transfer",
      transferGroupId: "grupo-1",
      amount: "500.0000",
    });

    // Primero la que entra, después la que sale.
    const resultado = combinarTransferencias([entrada, salida]);

    expect(resultado).toHaveLength(1);
    const [item] = resultado;
    if (esTransferencia(item!)) {
      expect(item.salida.id).toBe("salida");
      expect(item.entrada.id).toBe("entrada");
    }
  });

  it("deja los movimientos normales tal cual, sin combinarlos", () => {
    const gasto = movimiento({ id: "gasto", amount: "-50000.0000" });
    const ingreso = movimiento({ id: "ingreso", amount: "80000.0000" });

    const resultado = combinarTransferencias([gasto, ingreso]);

    expect(resultado).toEqual([gasto, ingreso]);
  });

  it("si solo llega una pata, la deja como movimiento normal en vez de esconderla", () => {
    // Pasa cuando la lista está filtrada a una sola cuenta: la API solo
    // devuelve la pata de esa cuenta.
    const soloSalida = movimiento({
      id: "salida",
      kind: "transfer",
      transferGroupId: "grupo-1",
      amount: "-300000.0000",
    });

    const resultado = combinarTransferencias([soloSalida]);

    expect(resultado).toEqual([soloSalida]);
    expect(esTransferencia(resultado[0]!)).toBe(false);
  });

  it("conserva el orden relativo frente a los movimientos normales", () => {
    const primero = movimiento({ id: "primero", amount: "-1000.0000" });
    const salida = movimiento({
      id: "salida",
      kind: "transfer",
      transferGroupId: "grupo-1",
      amount: "-2000.0000",
    });
    const entrada = movimiento({
      id: "entrada",
      kind: "transfer",
      transferGroupId: "grupo-1",
      amount: "2000.0000",
    });
    const ultimo = movimiento({ id: "ultimo", amount: "3000.0000" });

    const resultado = combinarTransferencias([primero, salida, entrada, ultimo]);

    expect(resultado).toHaveLength(3);
    expect((resultado[0] as Movimiento).id).toBe("primero");
    expect(esTransferencia(resultado[1]!)).toBe(true);
    expect((resultado[2] as Movimiento).id).toBe("ultimo");
  });

  it("mantiene separadas dos transferencias distintas", () => {
    const grupoA = [
      movimiento({ id: "a-salida", kind: "transfer", transferGroupId: "a", amount: "-100.0000" }),
      movimiento({ id: "a-entrada", kind: "transfer", transferGroupId: "a", amount: "100.0000" }),
    ];
    const grupoB = [
      movimiento({ id: "b-salida", kind: "transfer", transferGroupId: "b", amount: "-200.0000" }),
      movimiento({ id: "b-entrada", kind: "transfer", transferGroupId: "b", amount: "200.0000" }),
    ];

    const resultado = combinarTransferencias([...grupoA, ...grupoB]);

    expect(resultado).toHaveLength(2);
    expect(resultado.every(esTransferencia)).toBe(true);
  });

  it("una lista vacía no revienta", () => {
    expect(combinarTransferencias([])).toEqual([]);
  });
});
