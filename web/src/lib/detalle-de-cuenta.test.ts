import { describe, expect, it } from "vitest";

import {
  UMBRAL_AVISO_CUPO,
  etiquetaSaldo,
  estadoCupo,
  hayCambiosSinGuardar,
  porcentajeUsado,
  tonoBarraCupo,
} from "./detalle-de-cuenta";

describe("porcentajeUsado", () => {
  it("calcula el porcentaje con enteros exactos", () => {
    expect(porcentajeUsado("50000", "100000")).toBe(50);
    expect(porcentajeUsado("80000", "100000")).toBe(80);
  });

  it("topa en 100 al pasarse y en 0 sin deuda", () => {
    expect(porcentajeUsado("130000", "100000")).toBe(100);
    expect(porcentajeUsado("0", "100000")).toBe(0);
  });
});

describe("tonoBarraCupo", () => {
  it("neutro con margen, ámbar cerca del tope y rojo al pasarlo", () => {
    expect(tonoBarraCupo(5)).toBe("bg-foreground/60");
    expect(tonoBarraCupo(UMBRAL_AVISO_CUPO - 1)).toBe("bg-foreground/60");
    expect(tonoBarraCupo(UMBRAL_AVISO_CUPO)).toBe("bg-amber-500");
    expect(tonoBarraCupo(95)).toBe("bg-amber-500");
    expect(tonoBarraCupo(100)).toBe("bg-destructive");
  });
});

describe("estadoCupo", () => {
  it("sin cupo no hay estado que mostrar", () => {
    expect(estadoCupo(null, "-50000")).toBeNull();
  });

  it("con deuda reparte cupo, usado y disponible", () => {
    expect(estadoCupo("2000000", "-500000")).toEqual({
      disponible: "1500000.0000",
      usado: "500000.0000",
      porcentaje: 25,
    });
  });

  it("una tarjeta sobrepagada no muestra 'usado' negativo", () => {
    const estado = estadoCupo("2000000", "100000");
    expect(estado?.usado).toBe("0");
    expect(estado?.porcentaje).toBe(0);
    expect(estado?.disponible).toBe("2100000.0000");
  });
});

describe("etiquetaSaldo", () => {
  it("en las cuentas que no son tarjeta es un saldo a secas", () => {
    expect(etiquetaSaldo({ type: "bank", balance: "-100" })).toBe("Saldo");
  });

  it("en una tarjeta distingue deuda, cero y saldo a favor", () => {
    expect(etiquetaSaldo({ type: "card", balance: "-100000" })).toBe("Debes");
    expect(etiquetaSaldo({ type: "card", balance: "0.0000" })).toBe("Sin deuda");
    expect(etiquetaSaldo({ type: "card", balance: "50000" })).toBe("A favor");
  });
});

describe("hayCambiosSinGuardar", () => {
  const banco = {
    nombreGuardado: "Bancolombia",
    cupoGuardado: "",
    esTarjeta: false,
    moneda: "COP",
  };
  const tarjeta = {
    nombreGuardado: "Visa",
    cupoGuardado: "2.000.000",
    esTarjeta: true,
    moneda: "COP",
  };

  it("detecta el nombre editado", () => {
    expect(hayCambiosSinGuardar({ ...banco, nombre: "Otra", cupo: "" })).toBe(true);
    expect(hayCambiosSinGuardar({ ...banco, nombre: "Bancolombia", cupo: "" })).toBe(false);
  });

  it("no cuenta el nombre con espacios de más", () => {
    expect(hayCambiosSinGuardar({ ...banco, nombre: "  Bancolombia  ", cupo: "" })).toBe(false);
  });

  it("en las cuentas que no son tarjeta el cupo no aplica", () => {
    expect(hayCambiosSinGuardar({ ...banco, nombre: "Bancolombia", cupo: "999" })).toBe(false);
  });

  it("en una tarjeta el cupo se compara por valor, no por texto", () => {
    expect(hayCambiosSinGuardar({ ...tarjeta, nombre: "Visa", cupo: "2000000" })).toBe(false);
    expect(hayCambiosSinGuardar({ ...tarjeta, nombre: "Visa", cupo: "3.000.000" })).toBe(true);
  });

  it("un monto inválido cuenta como sin guardar", () => {
    expect(hayCambiosSinGuardar({ ...tarjeta, nombre: "Visa", cupo: "2.000.000,50" })).toBe(true);
  });

  it("vaciar el cupo es un cambio solo si había uno guardado", () => {
    expect(hayCambiosSinGuardar({ ...tarjeta, nombre: "Visa", cupo: "" })).toBe(true);
    expect(
      hayCambiosSinGuardar({ ...tarjeta, cupoGuardado: "", nombre: "Visa", cupo: "" })
    ).toBe(false);
  });
});
