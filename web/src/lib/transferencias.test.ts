import { describe, expect, it } from "vitest";
import { cuentasDeDestino } from "./transferencias";
import type { Cuenta } from "./api/types";

function cuenta(datos: Partial<Cuenta> & Pick<Cuenta, "id">): Cuenta {
  return {
    name: datos.id,
    type: "bank",
    currency: "COP",
    balance: "0.0000",
    movementCount: 0,
    lastMovementAt: null,
    archivedAt: null,
    ...datos,
  };
}

describe("cuentasDeDestino", () => {
  it("deja solo las otras cuentas de la misma moneda", () => {
    const cuentas = [
      cuenta({ id: "a", currency: "COP" }),
      cuenta({ id: "b", currency: "COP" }),
      cuenta({ id: "c", currency: "USD" }),
    ];

    expect(cuentasDeDestino(cuentas, "a").map((c) => c.id)).toEqual(["b"]);
  });

  it("devuelve todas las demás cuentas de la misma moneda, en orden", () => {
    const cuentas = [
      cuenta({ id: "a", currency: "COP" }),
      cuenta({ id: "b", currency: "COP" }),
      cuenta({ id: "c", currency: "COP" }),
    ];

    expect(cuentasDeDestino(cuentas, "a").map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("no ofrece nada si la única otra cuenta es de otra moneda", () => {
    const cuentas = [cuenta({ id: "a", currency: "COP" }), cuenta({ id: "b", currency: "USD" })];

    expect(cuentasDeDestino(cuentas, "a")).toEqual([]);
  });

  it("no ofrece nada con una sola cuenta, sin cuentas, o con un origen que no existe", () => {
    const sola = [cuenta({ id: "a" })];

    expect(cuentasDeDestino(sola, "a")).toEqual([]);
    expect(cuentasDeDestino([], "a")).toEqual([]);
    expect(cuentasDeDestino(sola, "no-existe")).toEqual([]);
  });
});
