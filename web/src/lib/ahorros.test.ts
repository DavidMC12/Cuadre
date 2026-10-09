import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";

import {
  leerMontoDeAhorro,
  montoConSigno,
  textoDeExito,
  textoDeRegistro,
  textoDeVistaPrevia,
  verboDeRegistro,
} from "./ahorros";
import type { RegistroDeAhorro } from "@/lib/api/types";

afterEach(cleanup);

function registro(amount: string): RegistroDeAhorro {
  return {
    id: "reg-1",
    accountId: "cta-1",
    currency: "COP",
    amount,
    occurredAt: "2026-10-08T12:00:00.000Z",
    description: null,
  };
}

describe("verboDeRegistro", () => {
  it("Apartaste con positivo", () => {
    expect(verboDeRegistro("500000.0000")).toBe("Apartaste");
  });

  it("Retiraste con negativo", () => {
    expect(verboDeRegistro("-500000.0000")).toBe("Retiraste");
  });

  it("con cero no hay verbo", () => {
    expect(verboDeRegistro("0.0000")).toBeNull();
    expect(verboDeRegistro("-0.0000")).toBeNull();
  });
});

describe("textoDeRegistro", () => {
  it("un aparte muestra la cifra sin doble signo", () => {
    expect(textoDeRegistro(registro("500000.0000"))).toBe("Apartaste $500.000");
  });

  it("un retiro da la cifra en positivo: el verbo ya dice que se retiró", () => {
    expect(textoDeRegistro(registro("-25000.0000"))).toBe("Retiraste $500.000".replace("$500.000", "$25.000"));
  });

  it("una cuenta en dólares usa su símbolo y sus centavos", () => {
    expect(textoDeRegistro({ ...registro("50.2500"), currency: "USD" })).toBe("Apartaste US$50,25");
  });

  it("con cero no hay línea", () => {
    expect(textoDeRegistro(registro("0.0000"))).toBeNull();
  });
});

describe("montoConSigno", () => {
  it("aparte no toca el texto: el positivo es el monto tal cual", () => {
    expect(montoConSigno("aparte", "500000")).toBe("500000");
  });

  it("retire antepone el menos: el signo lo decide la interfaz, no el tecleo", () => {
    expect(montoConSigno("retire", "500000")).toBe("-500000");
  });
});

describe("textoDeVistaPrevia", () => {
  it("anuncia un aparte", () => {
    expect(textoDeVistaPrevia("aparte", "500000", "COP")).toBe(
      "Vas a anotar que apartaste $500.000 para ahorro."
    );
  });

  it("anuncia un retiro", () => {
    expect(textoDeVistaPrevia("retire", "25000", "COP")).toBe(
      "Vas a anotar que retiraste $25.000 para ahorro."
    );
  });
});

describe("leerMontoDeAhorro", () => {
  it("vacío falla con 'Escribe el monto.': el clic pidió guardar", () => {
    expect(leerMontoDeAhorro("", "COP")).toEqual({
      error: "Escribe el monto.",
      monto: null,
      valida: false,
    });
    expect(leerMontoDeAhorro("   ", "COP").error).toBe("Escribe el monto.");
  });

  it("el cero se avisa antes de que vaya al servidor", () => {
    expect(leerMontoDeAhorro("0", "COP").error).toBe("El monto tiene que ser mayor que cero.");
    expect(leerMontoDeAhorro("0", "USD").error).toBe("El monto tiene que ser mayor que cero.");
  });

  it("lo mal escrito se lee como lo lee money.ts, con su frase de costumbre", () => {
    expect(leerMontoDeAhorro("25.000,50", "COP").error).toBe(
      "Los pesos no llevan decimales: escribe el monto completo, por ejemplo 25.000."
    );
  });

  it("una cifra válida no falla y sale lista, positiva", () => {
    expect(leerMontoDeAhorro("500.000", "COP")).toEqual({
      error: null,
      monto: "500000",
      valida: true,
    });
  });
});

describe("textoDeExito", () => {
  it("nombra la cuenta", () => {
    expect(textoDeExito(registro("500000.0000"), "Vacaciones")).toBe(
      "Apartaste $500.000 en Vacaciones."
    );
  });

  it("con un retiro, el verbo cambia y la cifra queda en positivo", () => {
    expect(textoDeExito(registro("-50000.0000"), "Vacaciones")).toBe(
      "Retiraste $50.000 en Vacaciones."
    );
  });
});
