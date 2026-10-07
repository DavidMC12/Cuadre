import { describe, expect, it } from "vitest";

import { leerAjuste, TEXTO_YA_COINCIDE } from "./ajuste-de-saldo";
import type { LecturaDeAjuste } from "./ajuste-de-saldo";
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

type Cuentita = Pick<Cuenta, "type" | "balance" | "currency">;

function lecturaValida(texto: string, cuenta: Cuentita): LecturaDeAjuste {
  const lectura = leerAjuste(texto, cuenta);
  if (lectura === null) throw new Error("se esperaba una lectura, no un campo vacío");
  if ("error" in lectura) throw new Error(`se esperaba una lectura válida, salió '${lectura.error}'`);
  return lectura;
}

function errorDe(texto: string, cuenta: Cuentita): string {
  const lectura = leerAjuste(texto, cuenta);
  if (lectura === null || !("error" in lectura)) {
    throw new Error("se esperaba un error, no una lectura válida");
  }
  return lectura.error;
}

describe("leerAjuste: la deuda escrita se convierte a saldo con signo", () => {
  it("deuda 350.000 en una tarjeta que debe 500.000: balance '-350000' y ajuste de +150.000", () => {
    const lectura = lecturaValida("350.000", visa);

    expect(lectura.balance).toBe("-350000");
    expect(lectura.diferencia).toBe("150000.0000");
    expect(lectura.coincide).toBe(false);
    expect(lectura.vistaPrevia).toBe(
      "Hoy la app dice que debes $500.000. Se registrará un ajuste de +$150.000 para que coincida."
    );
  });

  it("deuda 1.500.000 en una tarjeta sin deuda: ajuste de −1.500.000", () => {
    const lectura = lecturaValida("1.500.000", { ...visa, balance: "0.0000" });

    expect(lectura.balance).toBe("-1500000");
    expect(lectura.diferencia).toBe("-1500000.0000");
    expect(lectura.vistaPrevia).toContain(`ajuste de ${MENOS}$1.500.000 para que coincida`);
  });

  it("deuda cero en una tarjeta sobrepagada: ajuste de −50.000 y el 'dice' se entiende", () => {
    const lectura = lecturaValida("0", { ...visa, balance: "50000.0000" });

    expect(lectura.balance).toBe("0");
    expect(lectura.diferencia).toBe("-50000.0000");
    expect(lectura.vistaPrevia).toBe(
      "Hoy la app dice que queda $50.000 a tu favor. Se registrará un ajuste de −$50.000 para que coincida."
    );
  });

  it("la deuda no se escribe con signo", () => {
    expect(errorDe("-350.000", visa)).toBe("Escribe la deuda sin signo.");
  });

  it("los ceros de adorno se van del texto de la cifra", () => {
    const lectura = lecturaValida("00350", visa);

    expect(lectura.balance).toBe("-350");
    expect(lectura.vistaPrevia).toContain("ajuste de +$499.650 para que coincida");

    const sobregiro = lecturaValida("-007", banco);
    expect(sobregiro.balance).toBe("-7");
    expect(sobregiro.vistaPrevia).toContain("ajuste de −$1.200.007 para que coincida");
  });

  it("el cero de un sobregiro ('-0', '-0.00') no lleva signo, ni en el body ni en el texto", () => {
    const negativo = leerAjuste("-0", banco)!;
    if ("error" in negativo || negativo === null) throw new Error("se esperaba lectura");
    expect(negativo.balance).toBe("0");

    // Con saldo cero ya coincide: cero es cero, no "−$0".
    // Con saldo cero ya coincide: cero es cero, no "−$0". (En pesos el
    // lector rechaza "-0,00" — no llevan decimales —, así que el caso
    // decimal es en dólares.)
    const conCero = lecturaValida("-0,00", {
      type: "bank",
      balance: "0.0000",
      currency: "USD",
    });
    expect(conCero.balance).toBe("0");
    expect(conCero.coincide).toBe(true);
    expect(conCero.vistaPrevia).toBe(TEXTO_YA_COINCIDE);
  });

  it("en monedas con centavos los ceros de miles se van sin comerse el decimal", () => {
    const lectura = lecturaValida("007,50", {
      type: "cash",
      balance: "1.0000",
      currency: "USD",
    });

    expect(lectura.balance).toBe("7.50");
    expect(lectura.vistaPrevia).toContain("ajuste de +US$6,50 para que coincida");
  });
});

describe("leerAjuste: la cifra exacta manda", () => {
  it("en una cuenta que no es tarjeta se escribe el saldo, y cero vale", () => {
    const lectura = lecturaValida("1.200.000", banco);

    expect(lectura.balance).toBe("1200000");
    expect(lectura.diferencia).toBe("0.0000");
    expect(lectura.vistaPrevia).toBe(TEXTO_YA_COINCIDE);
  });

  it("un sobregiro se escribe con menos y la diferencia sale con signo", () => {
    const lectura = lecturaValida("-50.000", banco);

    expect(lectura.balance).toBe("-50000");
    expect(lectura.diferencia).toBe("-1250000.0000");
    expect(lectura.vistaPrevia).toBe(
      "Hoy la app dice $1.200.000. Se registrará un ajuste de −$1.250.000 para que coincida."
    );
  });

  it("centavos exactos: sin flotante que se coma un peso", () => {
    const lectura = lecturaValida("1500,50", {
      type: "cash",
      balance: "1500.0000",
      currency: "USD",
    });

    expect(lectura.balance).toBe("1500.50");
    expect(lectura.diferencia).toBe("0.5000");
    expect(lectura.coincide).toBe(false);
  });

  it("la cifra del banco se respeta tal cual, escrita con miles", () => {
    const lectura = lecturaValida("350.000", {
      type: "bank",
      balance: "350000.0000",
      currency: "COP",
    });

    expect(lectura.coincide).toBe(true);
  });
});

describe("leerAjuste: casos de borde", () => {
  it("el campo vacío no es error todavía: no hay nada que calcular", () => {
    expect(leerAjuste("", banco)).toBeNull();
    expect(leerAjuste("   ", banco)).toBeNull();
  });

  it("texto raro se dice en español, no en términos de la API", () => {
    expect(typeof errorDe("mucha plata", banco)).toBe("string");
  });

  it("sin diferencia el texto dice 'Ya coincide' y la diferencia es cero", () => {
    const lectura = lecturaValida("500.000", visa);

    expect(lectura.coincide).toBe(true);
    expect(lectura.vistaPrevia).toBe("Ya coincide.");
    expect(lectura.diferencia).toBe("0.0000");
  });
});
