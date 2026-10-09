import { describe, expect, it } from "vitest";

import type { Cuenta } from "./api/types";
import {
  completarLaOtraParte,
  cuentasParaLaParte,
  leerReparto,
  repartirALaMitad,
  repartoInicial,
} from "./pago-dividido";

describe("repartirALaMitad", () => {
  it("parte un total par justo por la mitad", () => {
    expect(repartirALaMitad("200000.0000", "COP")).toEqual(["100000.0000", "100000.0000"]);
  });

  it("si sobra una unidad de la moneda (un peso), se la lleva la primera cuenta", () => {
    expect(repartirALaMitad("100001.0000", "COP")).toEqual(["50001.0000", "50000.0000"]);
    // Siempre suman exacto el total.
    const [a, b] = repartirALaMitad("100001.0000", "COP");
    expect(BigInt(a.replace(".", "")) + BigInt(b.replace(".", ""))).toBe(BigInt("1000010000"));
  });

  it("en una moneda con centavos, el sobrante es un centavo", () => {
    expect(repartirALaMitad("10.01", "USD")).toEqual(["5.0100", "5.0000"]);
    expect(repartirALaMitad("0.01", "USD")).toEqual(["0.0100", "0.0000"]);
  });

  it("un total grande no pierde precisión", () => {
    expect(repartirALaMitad("9007199254740993", "COP")).toEqual([
      "4503599627370497.0000",
      "4503599627370496.0000",
    ]);
  });
});

describe("repartoInicial", () => {
  it("devuelve texto que un campo de monto sabe leer", () => {
    expect(repartoInicial("200000.0000", "COP")).toEqual(["100.000", "100.000"]);
    expect(repartoInicial("10.01", "USD")).toEqual(["5,01", "5,00"]);
  });
});

describe("completarLaOtraParte", () => {
  it("la otra parte es el total menos lo editado", () => {
    expect(completarLaOtraParte("200000.0000", "150.000", "COP")).toBe("50.000");
    expect(completarLaOtraParte("200000.0000", "1", "COP")).toBe("199.999");
  });

  it("no inventa nada si lo escrito no sirve o se pasa del total", () => {
    expect(completarLaOtraParte("200000.0000", "", "COP")).toBeNull();
    expect(completarLaOtraParte("200000.0000", "abc", "COP")).toBeNull();
    expect(completarLaOtraParte("200000.0000", "-5", "COP")).toBeNull();
    expect(completarLaOtraParte("200000.0000", "200.000", "COP")).toBeNull();
    expect(completarLaOtraParte("200000.0000", "300.000", "COP")).toBeNull();
  });
});

describe("leerReparto", () => {
  it("cuando las dos partes suman EXACTO el total, cuadra y trae los montos para enviar", () => {
    const reparto = leerReparto("200000.0000", "100.000", "100.000", "COP");

    expect(reparto).toEqual({
      montos: ["100000", "100000"],
      diferencia: "0.0000",
      cuadra: true,
      motivo: null,
    });
  });

  it("dice cuánto falta o cuánto se pasó, con la cifra exacta", () => {
    const faltan = leerReparto("200000.0000", "100.000", "50.000", "COP");
    const sobran = leerReparto("200000.0000", "150.000", "100.000", "COP");

    expect(faltan.cuadra).toBe(false);
    expect(faltan.diferencia).toBe("50000.0000");
    expect(faltan.motivo).toBe("Faltan $50.000 por repartir.");
    expect(sobran.cuadra).toBe(false);
    expect(sobran.diferencia).toBe("-50000.0000");
    expect(sobran.motivo).toBe("Te pasaste por $50.000.");
  });

  it("con decimales no se confunde por un centavo", () => {
    expect(leerReparto("10.01", "5,01", "5", "USD").cuadra).toBe(true);
    expect(leerReparto("10.01", "5", "5", "USD").cuadra).toBe(false);
  });

  it("sin total, con campos vacíos, ceros o texto inválido explica qué falta", () => {
    expect(leerReparto(null, "1", "1", "COP").motivo).toBe("Escribe primero el monto de la compra.");
    expect(leerReparto("200000.0000", "", "100.000", "COP").motivo).toBe(
      "Escribe cuánto va en cada cuenta."
    );
    expect(leerReparto("200000.0000", "0", "200.000", "COP").motivo).toBe(
      "Cada cuenta debe llevar más de cero."
    );
    expect(leerReparto("200000.0000", "-100.000", "300.000", "COP").cuadra).toBe(false);
    expect(leerReparto("200000.0000", "abc", "100.000", "COP").cuadra).toBe(false);
  });
});

describe("cuentasParaLaParte", () => {
  function cuenta(id: string, extras: Partial<Cuenta> = {}): Cuenta {
    return { id, currency: "COP", archivedAt: null, ...extras } as Cuenta;
  }
  const cuentas = [
    cuenta("a"),
    cuenta("b"),
    cuenta("c", { currency: "USD" }),
    cuenta("d", { archivedAt: "2026-01-01T00:00:00Z" }),
  ];

  it("solo activas, de la misma moneda y sin la que ya eligió la otra parte", () => {
    expect(cuentasParaLaParte(cuentas, "COP", "a").map((c) => c.id)).toEqual(["b"]);
    expect(cuentasParaLaParte(cuentas, "COP", null).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("sin moneda definida ofrece todas las activas menos la de la otra parte", () => {
    expect(cuentasParaLaParte(cuentas, undefined, "a").map((c) => c.id)).toEqual(["b", "c"]);
  });
});
