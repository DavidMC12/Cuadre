import { describe, expect, it } from "vitest";
import { formatearMientrasEscribe } from "./formatear-mientras-escribe";
import { normalizarMontoConSigno, normalizarMontoIngresado } from "./money";

/** Lee el resultado y compara el MONTO NUMÉRICO exacto, no solo "sin error". */
function leerMonto(formateado: string, moneda: string): string {
  const lectura = normalizarMontoIngresado(formateado, moneda);
  if ("error" in lectura)
    throw new Error(`Se esperaba un monto válido, dio error: ${lectura.error}`);
  return lectura.monto;
}

function esperarError(formateado: string, moneda: string): void {
  const lectura = normalizarMontoIngresado(formateado, moneda);
  expect("error" in lectura, `se esperaba un error, pero dio: ${JSON.stringify(lectura)}`).toBe(
    true
  );
}

/**
 * Simula tecla por tecla, como hace `CampoMonto` de verdad: cada carácter se
 * agrega al texto YA formateado del paso anterior, nunca al crudo original.
 * Es la prueba que habría detenido la regresión de no poder escribir un
 * monto de cinco cifras: alimentar la cadena completa de una sola vez no la
 * reproduce, porque ese no es el camino real de tecleo.
 */
function simularTecleo(
  teclas: string,
  moneda: string,
  opciones: { permiteSigno?: boolean } = {}
): string {
  let actual = "";
  for (const tecla of teclas) {
    actual = formatearMientrasEscribe(actual + tecla, moneda, opciones);
  }
  return actual;
}

describe("formatearMientrasEscribe — tecleando (por defecto)", () => {
  it("agrupa de a tres a medida que se teclea, para cualquier largo", () => {
    expect(simularTecleo("1", "COP")).toBe("1");
    expect(simularTecleo("150", "COP")).toBe("150");
    expect(simularTecleo("1500", "COP")).toBe("1.500");
    expect(simularTecleo("15000", "COP")).toBe("15.000");
    expect(simularTecleo("150000", "COP")).toBe("150.000");
    expect(simularTecleo("1500000", "COP")).toBe("1.500.000");
    expect(simularTecleo("12345678", "COP")).toBe("12.345.678");
    expect(leerMonto(simularTecleo("15000", "COP"), "COP")).toBe("15000");
  });

  it("regresión: tecleo real de un monto de cinco cifras o más nunca queda atascado", () => {
    // Esta es exactamente la secuencia que rompía antes de este arreglo: el
    // formateador trataba el punto de miles que él mismo acababa de poner
    // como si fuera ambiguo, y la persona quedaba sin poder escribir nada de
    // 15.000 pesos para arriba.
    for (const monto of ["15000", "150000", "1500000", "99999", "100000000"]) {
      const resultado = simularTecleo(monto, "COP");
      expect(leerMonto(resultado, "COP"), `tecleando "${monto}"`).toBe(monto);
    }
  });

  it("también al teclear con decimales (USD)", () => {
    expect(simularTecleo("15000", "USD")).toBe("15.000");
    expect(leerMonto(simularTecleo("100000,50", "USD"), "USD")).toBe("100000.50");
  });

  it("borrar un dígito (simulado como retroceder el texto) sigue agrupando bien", () => {
    // "1.500" sin su último dígito es "1.50" en crudo (el punto ya estaba
    // puesto por el propio campo) — debe seguir leyéndose como 150, no
    // quedarse pegado con un punto suelto.
    const conCincoDigitos = simularTecleo("15000", "COP"); // "15.000"
    const sinElUltimo = formatearMientrasEscribe(conCincoDigitos.slice(0, -1), "COP");
    expect(sinElUltimo).toBe("1.500");
    expect(leerMonto(sinElUltimo, "COP")).toBe("1500");
  });

  it("ignora letras y espacios sueltos", () => {
    expect(formatearMientrasEscribe("abc150000xyz", "COP")).toBe("150.000");
  });

  it("un campo vacío queda vacío", () => {
    expect(formatearMientrasEscribe("", "COP")).toBe("");
  });

  it("quita ceros a la izquierda, pero deja un solo cero", () => {
    expect(formatearMientrasEscribe("0", "COP")).toBe("0");
    expect(formatearMientrasEscribe("00", "COP")).toBe("0");
  });

  it("sin permitir signo, un guion (o el menos de la app) se ignora del todo", () => {
    expect(formatearMientrasEscribe("-150000", "COP")).toBe("150.000");
    expect(formatearMientrasEscribe("−150000", "COP")).toBe("150.000");
  });

  it("al escribir la coma (ya convertida desde el punto por CampoMonto), arranca la parte decimal", () => {
    expect(formatearMientrasEscribe("1500,", "USD")).toBe("1.500,");
    expect(formatearMientrasEscribe("1500,5", "USD")).toBe("1.500,5");
    expect(formatearMientrasEscribe("1500,50", "USD")).toBe("1.500,50");
  });

  it("no deja escribir más decimales de los que la moneda usa: se recorta, no se rechaza", () => {
    expect(formatearMientrasEscribe("1500,509", "USD")).toBe("1.500,50");
  });

  it("un punto que igual llegara mientras se escribe se descarta sin más (no se adivina como decimal)", () => {
    // No debería pasar en la práctica —CampoMonto lo intercepta como tecla—,
    // pero si pasara, descartarlo es seguro: nunca es la única pista de un
    // decimal mientras se teclea.
    expect(formatearMientrasEscribe("1500.50", "USD")).toBe("150.050");
  });

  describe("idempotencia", () => {
    const casos: Array<[string, string, boolean?]> = [
      ["1500000", "COP"],
      ["1500000", "USD"],
      ["1500,50", "USD"],
      ["-1500,50", "USD", true],
    ];

    it.each(casos)("formatear(%s, %s) es estable", (crudo, moneda, permiteSigno) => {
      const unaVez = formatearMientrasEscribe(crudo, moneda, { permiteSigno });
      const dosVeces = formatearMientrasEscribe(unaVez, moneda, { permiteSigno });
      expect(dosVeces).toBe(unaVez);
    });
  });

  it("con signo, el resultado lo lee normalizarMontoConSigno", () => {
    const formateado = formatearMientrasEscribe("-1500,50", "USD", { permiteSigno: true });
    const lectura = normalizarMontoConSigno(formateado, "USD");
    expect("error" in lectura, JSON.stringify(lectura)).toBe(false);
    if (!("error" in lectura)) expect(lectura.monto).toBe("-1500.50");
  });
});

describe("formatearMientrasEscribe — pegando (opciones.pegado: true)", () => {
  const pegado = { pegado: true };

  it("un agrupamiento de miles ya bien formado se reconoce", () => {
    expect(formatearMientrasEscribe("1.500.000", "COP", pegado)).toBe("1.500.000");
    expect(formatearMientrasEscribe("1,500,000", "COP", pegado)).toBe("1.500.000");
    expect(leerMonto(formatearMientrasEscribe("1.500.000", "COP", pegado), "COP")).toBe("1500000");
  });

  // Hallazgo crítico de una revisión anterior: esto se "limpiaba" hasta
  // convertirse en 150000 (×100 el monto real). Ahora no se toca al pegar, y
  // el validador de siempre da su error real.
  it("un intento de decimales en una moneda que no los usa NO se reformatea", () => {
    expect(formatearMientrasEscribe("1500,50", "COP", pegado)).toBe("1500,50");
    esperarError(formatearMientrasEscribe("1500,50", "COP", pegado), "COP");
    expect(formatearMientrasEscribe("1500.50", "COP", pegado)).toBe("1500.50");
    esperarError(formatearMientrasEscribe("1500.50", "COP", pegado), "COP");
  });

  it("un formato inglés pegado (dos separadores) tampoco se reformatea", () => {
    expect(formatearMientrasEscribe("1,500.50", "COP", pegado)).toBe("1,500.50");
    esperarError(formatearMientrasEscribe("1,500.50", "COP", pegado), "COP");
    expect(formatearMientrasEscribe("1,500.50", "USD", pegado)).toBe("1,500.50");
    esperarError(formatearMientrasEscribe("1,500.50", "USD", pegado), "USD");
  });

  // Hallazgo crítico de una revisión anterior: un único punto pegado (por
  // ejemplo copiado de un sitio con teclado numérico sin coma) se leía como
  // agrupamiento de miles y el monto quedaba ×100. Ahora se lee como decimal,
  // igual que ya tolera el validador.
  it("un único punto seguido de pocos dígitos se lee como decimal", () => {
    expect(formatearMientrasEscribe("1500.50", "USD", pegado)).toBe("1.500,50");
    expect(leerMonto(formatearMientrasEscribe("1500.50", "USD", pegado), "USD")).toBe("1500.50");
  });

  it("un punto seguido de más dígitos de los que la moneda admite no es decimal, y no se adivina", () => {
    expect(formatearMientrasEscribe("1500.509", "USD", pegado)).toBe("1500.509");
    esperarError(formatearMientrasEscribe("1500.509", "USD", pegado), "USD");
  });

  it("varios puntos siguen siendo un agrupamiento de miles, no decimales", () => {
    expect(formatearMientrasEscribe("1.500.000", "USD", pegado)).toBe("1.500.000");
    expect(leerMonto(formatearMientrasEscribe("1.500.000", "USD", pegado), "USD")).toBe("1500000");
  });

  it("cero coma algo conserva el cero", () => {
    expect(formatearMientrasEscribe("0,5", "USD", pegado)).toBe("0,5");
  });

  // Hallazgo crítico de una revisión anterior: una coma usada como separador
  // de MILES (formato inglés, "1,500" = mil quinientos) se leía como decimal
  // y perdía dígitos de verdad (quedaba en 1,50). El punto ya distinguía
  // "agrupamiento completo" de "decimal suelto"; a la coma le faltaba el
  // mismo chequeo.
  it("una coma que agrupa de a tres por completo es de miles, no decimal", () => {
    for (const [crudo, monto] of [
      ["1,500", "1500"],
      ["25,000", "25000"],
      ["10,000", "10000"],
      ["12,345", "12345"],
      ["1,500,000", "1500000"],
    ] as const) {
      const formateado = formatearMientrasEscribe(crudo, "USD", pegado);
      expect(leerMonto(formateado, "USD"), `pegando "${crudo}"`).toBe(monto);
    }
  });

  it("una coma con más dígitos de los que la moneda admite, y que no agrupa de a tres, no se adivina", () => {
    // "1,5000": ni es un decimal válido (4 dígitos > 2 que admite USD) ni un
    // agrupamiento de miles (el grupo no tiene exactamente tres dígitos).
    const formateado = formatearMientrasEscribe("1,5000", "USD", pegado);
    expect(formateado).toBe("1,5000");
    esperarError(formateado, "USD");
  });

  it("solo la última coma separa decimales; una coma de más suma sus dígitos al entero", () => {
    expect(formatearMientrasEscribe("1,500,50", "USD", pegado)).toBe("1.500,50");
    expect(leerMonto(formatearMientrasEscribe("1,500,50", "USD", pegado), "USD")).toBe("1500.50");
  });

  it("con signo permitido, conserva el guion o el menos de la app", () => {
    expect(formatearMientrasEscribe("-1500,50", "USD", { ...pegado, permiteSigno: true })).toBe(
      "-1.500,50"
    );
    expect(formatearMientrasEscribe("−1500,50", "USD", { ...pegado, permiteSigno: true })).toBe(
      "-1.500,50"
    );
  });

  it("idempotencia también al pegar", () => {
    for (const [crudo, moneda] of [
      ["1500,50", "COP"],
      ["1,500.50", "USD"],
    ] as const) {
      const unaVez = formatearMientrasEscribe(crudo, moneda, pegado);
      const dosVeces = formatearMientrasEscribe(unaVez, moneda, pegado);
      expect(dosVeces).toBe(unaVez);
    }
  });
});
