import { describe, expect, it } from "vitest";

import { leerAjuste, TEXTO_YA_COINCIDE } from "./ajuste-de-saldo";
import { MENOS } from "./money";
import type { Cuenta } from "./api/types";

const banco: Pick<Cuenta, "type" | "balance" | "currency"> = {
  type: "bank",
  balance: "1200000.0000",
  currency: "COP",
};

const visa: Pick<Cuenta, "type" | "balance" | "currency"> = {
  type: "card",
  balance: "-500000.0000",
  currency: "COP",
};

describe("leerAjuste: la deuda escrita se convierte a saldo con signo", () => {
  it("deuda 350.000 en una tarjeta que debe 500.000: balance '-350000' y ajuste de +150.000", () => {
    const lectura = leerAjuste("350.000", visa);
    expect(lectura).not.toBeNull();
    expect("error" in lectura).toBe(false);

    expect(lectura!.balance).toBe("-350000");
    expect(lectura!.diferencia).toBe("150000.0000");
    expect(lectura!.coincide).toBe(false);
    expect(lectura!.vistaPrevia).toBe(
      "Hoy la app dice que debes $500.000. Se registrará un ajuste de +$150.000 para que coincida."
    );
  });

  it("deuda 1.500.000 en una tarjeta sin deuda: ajuste de −1.500.000", () => {
    const lectura = leerAjuste("1.500.000", { ...visa, balance: "0.0000" });

    expect(lectura!.balance).toBe("-1500000");
    expect(lectura!.diferencia).toBe("-1500000.0000");
    expect(lectura!.vistaPrevia).toContain(`ajuste de ${MENOS}$1.500.000 para que coincida`);
  });

  it("deuda cero en una tarjeta sobrepagada: ajuste de −50.000 y el 'dice' se entiende", () => {
    const lectura = leerAjuste("0", { ...visa, balance: "50000.0000" });

    expect(lectura!.balance).toBe("0");
    expect(lectura!.diferencia).toBe("-50000.0000");
    expect(lectura!.coincide).toBe(false);
    expect(lectura!.vistaPrevia).toBe(
      "Hoy la app dice que queda $50.000 a tu favor. Se registrará un ajuste de −$50.000 para que coincida."
    );
  });

  it("la deuda no se escribe con signo", () => {
    const lectura = leerAjuste("-350.000", visa);

    expect("error" in lectura).toBe(true);
    if ("error" in lectura) expect(lectura.error).toBe("Escribe la deuda sin signo.");
  });
});

describe("leerAjuste: la cifra exacta manda", () => {
  it("en una cuenta que no es tarjeta se escribe el saldo, con sobregiro permitido", () => {
    const lectura = leerAjuste("1.200.000", banco);

    expect(lectura!.balance).toBe("1200000");
    expect(lectura!.diferencia).toBe("0.0000");
    expect(lectura!.vistaPrevia).toBe(TEXTO_YA_COINCIDE);
  });

  it("un sobregiro se escribe con menos y la diferencia sale con signo", () => {
    const lectura = leerAjuste("-50.000", banco);

    expect(lectura!.balance).toBe("-50000");
    expect(lectura!.diferencia).toBe("-1250000.0000");
    expect(lectura!.vistaPrevia).toBe(
      "Hoy la app dice $1.200.000. Se registrará un ajuste de −$1.250.000 para que coincida."
    );
  });

  it("centavos exactos: sin flotante que se coma un peso", () => {
    const lectura = leerAjuste("1500,50", {
      type: "cash",
      balance: "1500.0000",
      currency: "USD",
    });

    expect(lectura!.balance).toBe("1500.50");
    expect(lectura!.diferencia).toBe("0.5000");
    expect(lectura!.coincide).toBe(false);
  });

  it("la cifra del banco se respeta tal cual, escrita con miles", () => {
    const lectura = leerAjuste("350.000", {
      type: "bank",
      balance: "350000.0000",
      currency: "COP",
    });

    expect(lectura!.coincide).toBe(true);
  });
});

describe("leerAjuste: casos de borde", () => {
  it("el campo vacío no es error todavía: no hay nada que calcular", () => {
    expect(leerAjuste("", banco)).toBeNull();
    expect(leerAjuste("   ", banco)).toBeNull();
  });

  it("texto raro se dice en español, no en términos de la API", () => {
    const lectura = leerAjuste("mucha plata", banco);
    expect("error" in lectura).toBe(true);
  });

  it("sin diferencia el texto dice 'Ya coincide' y la diferencia es cero", () => {
    const lectura = leerAjuste("500.000", visa);

    expect(lectura!.coincide).toBe(true);
    expect(lectura!.vistaPrevia).toBe("Ya coincide.");
    expect(lectura!.diferencia).toBe("0.0000");
  });
});
