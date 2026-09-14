/**
 * El formateo de montos ya se rompió dos veces en un solo día: una dejó la app
 * en tipografía serif, y otra se comió los separadores de miles, con lo que dos
 * millones y medio se leían como veinticinco millones. Nada de eso lo detectan
 * el compilador ni el linter.
 */
import { describe, expect, it } from "vitest";
import {
  decimalesDe,
  esCero,
  formatearMonto,
  normalizarMontoIngresado,
  sumarMontos,
} from "./money";

const mostrar = (monto: string, moneda: string) => {
  const { negativo, entero, decimales } = formatearMonto(monto, moneda);
  return `${negativo ? "-" : ""}${entero}${decimales ? `,${decimales}` : ""}`;
};

describe("separadores de miles", () => {
  it("agrupa de a tres, empezando por la derecha", () => {
    expect(mostrar("2500000.0000", "COP")).toBe("2.500.000");
    expect(mostrar("1234567890.0000", "COP")).toBe("1.234.567.890");
    expect(mostrar("2500.0000", "COP")).toBe("2.500");
  });

  it("no agrupa lo que no llega a mil", () => {
    expect(mostrar("0.0000", "COP")).toBe("0");
    expect(mostrar("5.0000", "COP")).toBe("5");
    expect(mostrar("250.0000", "COP")).toBe("250");
  });

  it("conserva el signo negativo", () => {
    expect(mostrar("-277400.0000", "COP")).toBe("-277.400");
  });
});

describe("decimales segun la moneda", () => {
  it("los pesos no muestran centavos", () => {
    expect(decimalesDe("COP")).toBe(0);
    expect(mostrar("5565000.0000", "COP")).toBe("5.565.000");
  });

  it("los dolares si", () => {
    expect(decimalesDe("USD")).toBe(2);
    expect(mostrar("300.0000", "USD")).toBe("300,00");
    expect(mostrar("300.5000", "USD")).toBe("300,50");
  });

  it("una moneda desconocida usa dos decimales", () => {
    expect(decimalesDe("XYZ")).toBe(2);
  });

  it("en pesos igual se muestran los centavos si el monto los trae", () => {
    // Preferible que se vea raro a esconder plata.
    expect(mostrar("1234.5600", "COP")).toBe("1.234,56");
  });
});

describe("no se toca el dinero con coma flotante", () => {
  it("los montos grandes no pierden digitos", () => {
    // Number("999999999999999.9999") ya redondea; el texto no.
    expect(mostrar("999999999999999.9999", "USD")).toBe("999.999.999.999.999,99");
  });

  it("lee lo que la persona escribe con coma o con punto", () => {
    expect(normalizarMontoIngresado("1250,75")).toBe("1250.75");
    expect(normalizarMontoIngresado("1250.75")).toBe("1250.75");
    expect(normalizarMontoIngresado("no es un monto")).toBeNull();
    expect(normalizarMontoIngresado("-100")).toBeNull(); // el signo lo pone la app
  });

  it("suma sin perder centavos aunque sean muchos montos", () => {
    // 0.3333 sumado mil veces en coma flotante no da exactamente 333.3.
    const mil = Array(1000).fill("0.3333");
    expect(sumarMontos(mil)).toBe("333.3000");
  });

  it("suma montos grandes sin que Number los redondee primero", () => {
    expect(sumarMontos(["999999999999999.9999", "0.0001"])).toBe("1000000000000000.0000");
  });
});

describe("un cero es un cero, se escriba como se escriba", () => {
  it("reconoce el cero en sus formas", () => {
    expect(esCero("0")).toBe(true);
    expect(esCero("0.0000")).toBe(true);
    expect(esCero("-0.0000")).toBe(true);
    expect(esCero("  0  ")).toBe(true);
  });

  it("no confunde un monto chico con cero", () => {
    expect(esCero("0.0001")).toBe(false);
    expect(esCero("-0.0001")).toBe(false);
    expect(esCero("10")).toBe(false);
  });
});

describe("sumar los saldos de varias cuentas", () => {
  it("suma cuentas con signos distintos", () => {
    expect(sumarMontos(["320000.0000", "-58900.0000", "1200000.0000"])).toBe("1461100.0000");
  });

  it("una lista vacía suma cero", () => {
    expect(sumarMontos([])).toBe("0.0000");
  });

  it("cuentas en deuda pueden dejar el total en negativo", () => {
    expect(sumarMontos(["-500000.0000", "100000.0000"])).toBe("-400000.0000");
  });

  it("un solo monto se devuelve tal cual, con cuatro decimales", () => {
    expect(sumarMontos(["1234.5"])).toBe("1234.5000");
  });
});
