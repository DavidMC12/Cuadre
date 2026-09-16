import { describe, expect, it } from "vitest";
import { agruparCuentasPorMoneda } from "./agrupar-cuentas";
import type { Cuenta } from "./api/types";

function cuenta(datos: Partial<Cuenta> & Pick<Cuenta, "id" | "name" | "currency">): Cuenta {
  return {
    type: "bank",
    balance: "0.0000",
    movementCount: 0,
    lastMovementAt: null,
    archivedAt: null,
    isSavings: false,
    ...datos,
  };
}

describe("agruparCuentasPorMoneda", () => {
  it("sin cuentas devuelve un mapa vacío", () => {
    expect(agruparCuentasPorMoneda([])).toEqual(new Map());
  });

  it("con una sola moneda arma un único grupo", () => {
    const banco = cuenta({ id: "banco", name: "Banco", currency: "COP" });
    const efectivo = cuenta({ id: "efectivo", name: "Efectivo", currency: "COP" });

    const grupos = agruparCuentasPorMoneda([banco, efectivo]);

    expect(grupos.size).toBe(1);
    expect(grupos.get("COP")?.map((c) => c.id)).toEqual(["banco", "efectivo"]);
  });

  it("separa dos monedas intercaladas, conservando el orden dentro de cada una", () => {
    const banco = cuenta({ id: "banco", name: "Banco", currency: "COP" });
    const dolares = cuenta({ id: "dolares", name: "Dólares", currency: "USD" });
    const efectivo = cuenta({ id: "efectivo", name: "Efectivo", currency: "COP" });
    const ahorroUsd = cuenta({ id: "ahorro-usd", name: "Ahorro USD", currency: "USD" });

    const grupos = agruparCuentasPorMoneda([banco, dolares, efectivo, ahorroUsd]);

    expect([...grupos.keys()]).toEqual(["COP", "USD"]);
    expect(grupos.get("COP")?.map((c) => c.id)).toEqual(["banco", "efectivo"]);
    expect(grupos.get("USD")?.map((c) => c.id)).toEqual(["dolares", "ahorro-usd"]);
  });
});
