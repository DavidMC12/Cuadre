import { describe, expect, it } from "vitest";

import {
  deudaDeTarjeta,
  deudaEnTarjetas,
  esCuentaDeTienes,
  saldoAbsoluto,
  totalDeTienes,
} from "./detalle-de-cuenta";
import type { Cuenta } from "./api/types";

function cuenta(datos: Partial<Cuenta> & Pick<Cuenta, "id" | "name" | "currency">): Cuenta {
  return {
    type: "bank",
    balance: "0.0000",
    movementCount: 0,
    lastMovementAt: null,
    archivedAt: null,
    isSavings: false,
    creditLimit: null,
    linkedAccountId: null,
    ...datos,
  };
}

const banco = cuenta({ id: "banco", name: "Banco", currency: "COP", balance: "1000000.0000" });
const efectivo = cuenta({
  id: "efectivo",
  name: "Efectivo",
  currency: "COP",
  balance: "250000.0000",
});
const visa = cuenta({
  id: "visa",
  name: "Visa",
  currency: "COP",
  type: "card",
  balance: "-800000.0000",
  creditLimit: "2000000.0000",
});
const master = cuenta({
  id: "master",
  name: "Master",
  currency: "COP",
  type: "card",
  balance: "-200000.0000",
});
const sobrepagada = cuenta({
  id: "sobre",
  name: "Sobrepagada",
  currency: "COP",
  type: "card",
  balance: "50000.0000",
  creditLimit: "1000000.0000",
});
const usd = cuenta({ id: "usd", name: "Dólares", currency: "USD", balance: "300.0000" });
const visaUsd = cuenta({
  id: "visa-usd",
  name: "Visa USD",
  currency: "USD",
  type: "card",
  balance: "-100.0000",
});

describe("Tienes: solo las cuentas que no son tarjeta", () => {
  it("suma banco y efectivo, sin importar que haya tarjetas con deuda", () => {
    expect(totalDeTienes([banco, efectivo, visa, master], "COP")).toBe("1250000.0000");
  });

  it("no baja con la deuda de las tarjetas (la deuda va en su propio renglón)", () => {
    const conDeuda = totalDeTienes([banco], "COP");
    const conMasDeuda = totalDeTienes([banco, visa, master], "COP");
    expect(conDeuda).toBe(conMasDeuda);
    expect(conDeuda).toBe("1000000.0000");
  });

  it("no suma el saldo a favor de una tarjeta sobrepagada", () => {
    // Con la tarjeta sobrepagada, "Tienes" sigue siendo solo banco + efectivo.
    expect(totalDeTienes([banco, efectivo, sobrepagada], "COP")).toBe("1250000.0000");
  });

  it("no mezcla monedas", () => {
    expect(totalDeTienes([banco, usd], "COP")).toBe("1000000.0000");
    expect(totalDeTienes([banco, usd], "USD")).toBe("300.0000");
  });

  it("no cuenta las cuentas archivadas", () => {
    const bancoArchivado = cuenta({
      id: "viejo",
      name: "Viejo",
      currency: "COP",
      balance: "9999999.0000",
      archivedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(totalDeTienes([banco, bancoArchivado], "COP")).toBe("1000000.0000");
  });

  it("sin cuentas, o con solo tarjetas, 'Tienes' es cero", () => {
    expect(totalDeTienes([], "COP")).toBe("0.0000");
    expect(totalDeTienes([visa, master, sobrepagada], "COP")).toBe("0.0000");
  });
});

describe("Debes en tarjetas: solo deuda, nunca un saldo a favor que reste", () => {
  it("suma la deuda de varias tarjetas", () => {
    expect(deudaEnTarjetas([visa, master], "COP")).toBe("1000000.0000");
  });

  it("una tarjeta sobrepagada aporta cero: no resta", () => {
    expect(deudaDeTarjeta(sobrepagada)).toBe("0");
    expect(deudaEnTarjetas([visa, sobrepagada], "COP")).toBe("800000.0000");
  });

  it("sin deuda (o sin tarjetas) devuelve cero", () => {
    expect(deudaEnTarjetas([sobrepagada], "COP")).toBe("0.0000");
    expect(deudaEnTarjetas([banco, efectivo], "COP")).toBe("0.0000");
    expect(deudaEnTarjetas([], "COP")).toBe("0.0000");
  });

  it("no mezcla monedas", () => {
    expect(deudaEnTarjetas([visa, visaUsd], "COP")).toBe("800000.0000");
    expect(deudaEnTarjetas([visa, visaUsd], "USD")).toBe("100.0000");
  });

  it("no cuenta las tarjetas archivadas", () => {
    const visaArchivada = cuenta({
      id: "visa-vieja",
      name: "Visa vieja",
      currency: "COP",
      type: "card",
      balance: "-5000000.0000",
      archivedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(deudaEnTarjetas([visa, visaArchivada], "COP")).toBe("800000.0000");
  });
});

describe("saldoAbsoluto y esCuentaDeTienes", () => {
  it("devuelve la deuda de una tarjeta en positivo, sin el menos", () => {
    expect(saldoAbsoluto(visa)).toBe("800000.0000");
  });

  it("deja igual un saldo a favor o en cero", () => {
    expect(saldoAbsoluto(sobrepagada)).toBe("50000.0000");
    expect(saldoAbsoluto(cuenta({ id: "c", name: "C", currency: "COP" }))).toBe("0.0000");
  });

  it("normaliza un cero negativo: '-0.0000' no es un monto negativo", () => {
    expect(saldoAbsoluto({ balance: "-0.0000" })).toBe("0.0000");
  });

  it("acepta un monto con signo más y lo deja positivo", () => {
    expect(saldoAbsoluto({ balance: "+50000.0000" })).toBe("50000.0000");
  });

  it("una tarjeta nunca es cuenta de 'Tienes'", () => {
    expect(esCuentaDeTienes(banco)).toBe(true);
    expect(esCuentaDeTienes(efectivo)).toBe(true);
    expect(esCuentaDeTienes(visa)).toBe(false);
  });
});
