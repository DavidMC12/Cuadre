import { describe, expect, it } from "vitest";
import { clasificarEdicionDeMonto } from "./clasificar-edicion-de-monto";
import { normalizarMontoIngresado } from "./money";

function leerMonto(texto: string, moneda: string): string {
  const lectura = normalizarMontoIngresado(texto, moneda);
  if ("error" in lectura)
    throw new Error(`Se esperaba un monto válido, dio error: ${lectura.error}`);
  return lectura.monto;
}

function esperaError(texto: string, moneda: string): void {
  const lectura = normalizarMontoIngresado(texto, moneda);
  expect("error" in lectura, `se esperaba un error, pero dio: ${JSON.stringify(lectura)}`).toBe(
    true
  );
}

/** Simula tecla por tecla, arrancando confiable (como un campo vacío recién abierto). */
function simularTecleo(teclas: string, moneda: string, permiteSigno = false) {
  let texto = "";
  let confiable = true;
  for (const tecla of teclas) {
    const crudo = texto + tecla;
    const resultado = clasificarEdicionDeMonto(texto, crudo, crudo.length, moneda, {
      permiteSigno,
      confiablePrevio: confiable,
    });
    texto = resultado.texto;
    confiable = resultado.confiable;
  }
  return { texto, confiable };
}

/** Simula pegar `pegado` completo dentro de un campo que tenía `previo`. */
function simularPegado(previo: string, pegado: string, moneda: string, permiteSigno = false) {
  return clasificarEdicionDeMonto(previo, previo + pegado, (previo + pegado).length, moneda, {
    permiteSigno,
    confiablePrevio: true,
  });
}

describe("clasificarEdicionDeMonto — tecleo normal", () => {
  it("un monto de cinco cifras o más nunca se atasca (regresión de una revisión anterior)", () => {
    for (const monto of ["15000", "150000", "1500000", "999999999999"]) {
      const { texto, confiable } = simularTecleo(monto, "COP");
      expect(confiable, `tecleando "${monto}"`).toBe(true);
      expect(leerMonto(texto, "COP"), `tecleando "${monto}"`).toBe(monto);
    }
  });

  it("un punto tecleado en USD es el decimal, sin depender de onKeyDown", () => {
    const { texto } = simularTecleo("1500.50", "USD");
    expect(texto).toBe("1.500,50");
    expect(leerMonto(texto, "USD")).toBe("1500.50");
  });

  it("un segundo punto/coma tecleado se ignora, no recicla dígitos hacia el entero", () => {
    // Doble toque de la tecla decimal: "1500" + "," + "," -> debe quedar
    // igual que con una sola coma, nunca "150050,".
    let texto = "";
    let confiable = true;
    for (const tecla of ["1", "5", "0", "0", ".", "."]) {
      const crudo = texto + tecla;
      const resultado = clasificarEdicionDeMonto(texto, crudo, crudo.length, "USD", {
        confiablePrevio: confiable,
      });
      texto = resultado.texto;
      confiable = resultado.confiable;
    }
    expect(texto).toBe("1.500,");
    expect(confiable).toBe(true);
  });

  it("borrar un dígito sigue agrupando bien", () => {
    const despuesDeEscribir = simularTecleo("15000", "COP").texto; // "15.000"
    const resultado = clasificarEdicionDeMonto(
      despuesDeEscribir,
      despuesDeEscribir.slice(0, -1),
      despuesDeEscribir.length - 1,
      "COP",
      { confiablePrevio: true }
    );
    expect(resultado.texto).toBe("1.500");
    expect(leerMonto(resultado.texto, "COP")).toBe("1500");
  });

  it("seleccionar todo y escribir un dígito nuevo también es tecleo", () => {
    const resultado = clasificarEdicionDeMonto("1.500.000", "5", 1, "COP", {
      confiablePrevio: true,
    });
    expect(resultado.texto).toBe("5");
    expect(resultado.confiable).toBe(true);
  });
});

describe("clasificarEdicionDeMonto — texto ajeno (pegado, autocompletado, IME de varios caracteres)", () => {
  it("un pegado en formato inglés no se adivina, y el validador da su error real", () => {
    const resultado = simularPegado("", "1,500.50", "USD");
    expect(resultado.texto).toBe("1,500.50");
    expect(resultado.confiable).toBe(false);
    esperaError(resultado.texto, "USD");
  });

  it("un pegado con un único punto decimal sí se lee (misma tolerancia que el validador)", () => {
    const resultado = simularPegado("", "1500.50", "USD");
    expect(resultado.texto).toBe("1.500,50");
    expect(leerMonto(resultado.texto, "USD")).toBe("1500.50");
  });

  // Hallazgo crítico de la revisión: tras pegar algo ambiguo, la SIGUIENTE
  // tecla (incluido un simple Backspace) no debe "arreglar" el pegado
  // reinterpretándolo con el algoritmo permisivo — porque eso puede dar un
  // monto válido pero equivocado, sin ningún error visible.
  describe("regresión: editar después de un pegado ambiguo nunca produce un monto silencioso distinto", () => {
    it("un Backspace después de pegar formato inglés en USD", () => {
      const pegado = simularPegado("", "1,500.50", "USD");
      expect(pegado.confiable).toBe(false);

      const conBackspace = clasificarEdicionDeMonto(
        pegado.texto,
        pegado.texto.slice(0, -1),
        pegado.texto.length - 1,
        "USD",
        { confiablePrevio: pegado.confiable }
      );

      // Antes del arreglo, esto daba "1,50" -> se leía 1.50 en vez de un
      // error. Ahora debe seguir sin poder leerse con certeza.
      const lectura = normalizarMontoIngresado(conBackspace.texto, "USD");
      if (!("error" in lectura)) {
        throw new Error(
          `Se coló un monto silencioso: "${conBackspace.texto}" se leyó como ${lectura.monto}`
        );
      }
    });

    it("un dígito escrito después de pegar decimales en COP (que no los usa)", () => {
      const pegado = simularPegado("", "1500,50", "COP");
      expect(pegado.confiable).toBe(false);

      const conTecla = clasificarEdicionDeMonto(
        pegado.texto,
        `${pegado.texto}0`,
        pegado.texto.length + 1,
        "COP",
        { confiablePrevio: pegado.confiable }
      );

      const lectura = normalizarMontoIngresado(conTecla.texto, "COP");
      if (!("error" in lectura)) {
        throw new Error(
          `Se coló un monto silencioso: "${conTecla.texto}" se leyó como ${lectura.monto}`
        );
      }
    });
  });

  it("un reemplazo de varios caracteres a la vez (autocompletado, sin inputType) también se trata como ajeno", () => {
    // No hace falta que el navegador diga "esto fue un pegado": alcanza con
    // que hayan aparecido más de un carácter nuevo de una sola vez.
    const resultado = clasificarEdicionDeMonto("", "1500.509", "1500.509".length, "USD", {
      confiablePrevio: true,
    });
    expect(resultado.texto).toBe("1500.509");
    esperaError(resultado.texto, "USD");
  });

  it("pegar dentro de un campo con contenido: no se adivina, pero tampoco cuela un monto (falla con error)", () => {
    const resultado = simularPegado("1.500", "000", "COP");
    // "1.500" + "000" = "1.500000": no es un agrupamiento válido, se deja
    // tal cual y el validador da su error — no se pierde el "1.500" previo
    // en silencio.
    esperaError(resultado.texto, "COP");
  });

  it("un pegado limpio dentro de otro (que sí resulta reconocible) vuelve a quedar confiable", () => {
    // Borrar todo lo ambiguo hasta quedar en dígitos puros "sana" el campo.
    const resultado = simularPegado("", "1500", "COP");
    expect(resultado.texto).toBe("1.500");
    expect(resultado.confiable).toBe(true);
  });
});
