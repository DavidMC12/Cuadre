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
  normalizarMontoConSigno,
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

  it("lee los centavos de un monto en dólares con coma, o con un punto que no puede ser de miles", () => {
    expect(normalizarMontoIngresado("1250,75", "USD")).toEqual({ monto: "1250.75" });
    expect(normalizarMontoIngresado("1250.75", "USD")).toEqual({ monto: "1250.75" });
    expect(normalizarMontoIngresado("no es un monto", "USD")).toHaveProperty("error");
    // El signo lo pone la app, según sea gasto o ingreso.
    expect(normalizarMontoIngresado("-100", "USD")).toHaveProperty("error");
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

/**
 * "25.000" se guardaba como veinticinco pesos: el campo tomaba el punto como
 * decimal, justo al revés de como la app muestra ese mismo monto. Y un
 * movimiento no se edita, así que el error quedaba escrito para siempre.
 */
describe("lo que la persona escribe se lee como se escribe en Colombia", () => {
  const monto = (texto: string, moneda: string) => normalizarMontoIngresado(texto, moneda);

  describe("en pesos, punto y coma son de miles", () => {
    it("25.000 son veinticinco mil, no veinticinco", () => {
      expect(monto("25.000", "COP")).toEqual({ monto: "25000" });
      expect(monto("25000", "COP")).toEqual({ monto: "25000" });
    });

    it("acepta varios grupos de miles", () => {
      expect(monto("1.500.000", "COP")).toEqual({ monto: "1500000" });
      expect(monto("1.234.567.890", "COP")).toEqual({ monto: "1234567890" });
    });

    it("acepta la coma como separador de miles, para teclados que solo la traen", () => {
      expect(monto("25,000", "COP")).toEqual({ monto: "25000" });
      expect(monto("1,500,000", "COP")).toEqual({ monto: "1500000" });
    });

    it("ignora los espacios alrededor", () => {
      expect(monto("  25.000 ", "COP")).toEqual({ monto: "25000" });
    });

    it("rechaza decimales con un mensaje que dice por qué", () => {
      const sinDecimales = {
        error: "Los pesos no llevan decimales: escribe el monto completo, por ejemplo 25.000.",
      };
      expect(monto("25,50", "COP")).toEqual(sinDecimales);
      expect(monto("25.5", "COP")).toEqual(sinDecimales);
      expect(monto("1.500,00", "COP")).toEqual(sinDecimales);
      expect(monto("1.500,000", "COP")).toEqual(sinDecimales);
    });

    it("rechaza grupos de miles mal armados en vez de adivinar", () => {
      expect(monto("2.50.000", "COP")).toHaveProperty("error");
      expect(monto("25.0000", "COP")).toHaveProperty("error");
      expect(monto("0.500", "COP")).toHaveProperty("error");
      expect(monto("25..000", "COP")).toHaveProperty("error");
    });
  });

  describe("en dólares, punto de miles y coma decimal", () => {
    it("1.500,50 son mil quinientos dólares con cincuenta centavos", () => {
      expect(monto("1.500,50", "USD")).toEqual({ monto: "1500.50" });
      expect(monto("1500,5", "USD")).toEqual({ monto: "1500.5" });
      expect(monto("0,99", "USD")).toEqual({ monto: "0.99" });
    });

    it("un punto seguido de tres dígitos es de miles", () => {
      expect(monto("1.500", "USD")).toEqual({ monto: "1500" });
      expect(monto("2.000.000", "USD")).toEqual({ monto: "2000000" });
    });

    it("un punto seguido de uno o dos dígitos solo puede ser decimal", () => {
      expect(monto("1500.50", "USD")).toEqual({ monto: "1500.50" });
      expect(monto("2.5", "USD")).toEqual({ monto: "2.5" });
    });

    it("rechaza más centavos de los que tiene la moneda", () => {
      const maximo = { error: "Los dólares llevan máximo 2 decimales, por ejemplo 1.500,50." };
      expect(monto("10,555", "USD")).toEqual(maximo);
      // Con la costumbre de Estados Unidos esto serían mil quinientos; aquí la
      // coma es decimal, así que no se adivina y el ejemplo muestra cómo va.
      expect(monto("1,500", "USD")).toEqual(maximo);
    });

    it("rechaza separadores que no encajan en ninguna de las dos costumbres", () => {
      const malEscrito = {
        error: "Usa punto para los miles y coma para los centavos, por ejemplo 1.500,50.",
      };
      expect(monto("1,500,000", "USD")).toEqual(malEscrito);
      expect(monto("1500.505", "USD")).toEqual(malEscrito);
      expect(monto("1.50.0", "USD")).toEqual(malEscrito);
      expect(monto(",50", "USD")).toEqual(malEscrito);
      expect(monto("1500,", "USD")).toEqual(malEscrito);
    });
  });

  it("nombra en genérico una moneda que las pantallas no ofrecen", () => {
    expect(monto("100,5", "JPY")).toEqual({
      error: "Esta moneda no lleva decimales: escribe el monto completo, por ejemplo 25.000.",
    });
  });

  it("explica lo que falta cuando no hay monto o no es un número", () => {
    expect(monto("", "COP")).toEqual({ error: "Escribe el monto." });
    expect(monto("   ", "COP")).toEqual({ error: "Escribe el monto." });
    expect(monto("$25.000", "COP")).toEqual({
      error: "Escribe solo números, por ejemplo 25.000.",
    });
    expect(monto("veinte", "USD")).toEqual({
      error: "Escribe solo números, por ejemplo 1.500,50.",
    });
    expect(monto(".", "COP")).toHaveProperty("error");
  });

  it("en un campo sin signo, el menos se rechaza en vez de ignorarse", () => {
    expect(monto("-25.000", "COP")).toEqual({
      error: "Escribe el monto sin signo; si es un gasto, elige Gasto.",
    });
  });

  describe("con signo, como el saldo inicial de una tarjeta en deuda", () => {
    it("aplica las mismas reglas y conserva el menos", () => {
      expect(normalizarMontoConSigno("-1.500.000", "COP")).toEqual({ monto: "-1500000" });
      expect(normalizarMontoConSigno("2.000.000", "COP")).toEqual({ monto: "2000000" });
      expect(normalizarMontoConSigno("-1.500,50", "USD")).toEqual({ monto: "-1500.50" });
      expect(normalizarMontoConSigno("-25,5", "COP")).toHaveProperty("error");
    });

    it("un menos solo, o dos, no son un monto", () => {
      expect(normalizarMontoConSigno("-", "COP")).toEqual({ error: "Escribe el monto." });
      expect(normalizarMontoConSigno("--5", "COP")).toHaveProperty("error");
    });
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
