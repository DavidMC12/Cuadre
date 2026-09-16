import { describe, expect, it } from "vitest";
import { clasificarEdicionDeMonto } from "./clasificar-edicion-de-monto";
import { formatearMientrasEscribe } from "./formatear-mientras-escribe";
import { normalizarMontoIngresado } from "./money";

function leerMonto(texto: string, moneda: string): string {
  const lectura = normalizarMontoIngresado(texto, moneda);
  if ("error" in lectura)
    throw new Error(`Se esperaba un monto válido, dio error: ${lectura.error}`);
  return lectura.monto;
}

/**
 * Igual que hace `CampoMonto` de verdad: `confiable` se recalcula en cada
 * paso a partir del texto actual, nunca se arrastra en una variable aparte.
 * Es lo que hace que un desmontaje del componente no pueda desincronizarlo.
 */
function confiableDe(texto: string, moneda: string, permiteSigno = false): boolean {
  return formatearMientrasEscribe(texto, moneda, { permiteSigno }) === texto;
}

/** Simula tecla por tecla, siempre agregando al final (como hace CampoMonto: el cursor va al final). */
function simularTecleo(teclas: string, moneda: string, permiteSigno = false) {
  let texto = "";
  for (const tecla of teclas) {
    const crudo = texto + tecla;
    const resultado = clasificarEdicionDeMonto(texto, crudo, moneda, {
      permiteSigno,
      confiablePrevio: confiableDe(texto, moneda, permiteSigno),
    });
    texto = resultado.texto;
  }
  return texto;
}

/** Simula pegar `pegado` completo dentro de un campo que tenía `previo`. */
function simularPegado(previo: string, pegado: string, moneda: string, permiteSigno = false) {
  return clasificarEdicionDeMonto(previo, previo + pegado, moneda, {
    permiteSigno,
    confiablePrevio: true,
  });
}

describe("clasificarEdicionDeMonto — tecleo normal", () => {
  it("un monto de cinco cifras o más nunca se atasca (regresión: no se puede teclear con la regla vieja)", () => {
    for (const monto of ["15000", "150000", "1500000", "999999999999"]) {
      const texto = simularTecleo(monto, "COP");
      expect(leerMonto(texto, "COP"), `tecleando "${monto}"`).toBe(monto);
    }
  });

  it("un punto tecleado en USD es el decimal", () => {
    const texto = simularTecleo("1500.50", "USD");
    expect(texto).toBe("1.500,50");
    expect(leerMonto(texto, "USD")).toBe("1500.50");
  });

  // Hallazgo crítico de una revisión anterior: escribir el separador decimal
  // como PRIMERA tecla ("· 9 9" para 0,99) registraba 9.90 — el formateador
  // inserta un "0" delante de la coma que la persona nunca escribió, y
  // ubicar el cursor contando dígitos no tenía forma de saber que ese "0"
  // era nuevo. Con el cursor siempre al final, esto ya no puede pasar.
  it("escribir el punto/coma decimal como primera tecla registra el monto correcto", () => {
    expect(leerMonto(simularTecleo(".99", "USD"), "USD")).toBe("0.99");
    expect(leerMonto(simularTecleo(",50", "USD"), "USD")).toBe("0.50");
    expect(leerMonto(simularTecleo(".05", "USD"), "USD")).toBe("0.05");
  });

  it("un segundo punto/coma tecleado se ignora, no recicla dígitos hacia el entero", () => {
    expect(simularTecleo("1500..", "USD")).toBe("1.500,");
  });

  it("borrar un dígito sigue agrupando bien", () => {
    const conCincoDigitos = simularTecleo("15000", "COP"); // "15.000"
    const resultado = clasificarEdicionDeMonto(
      conCincoDigitos,
      conCincoDigitos.slice(0, -1),
      "COP",
      { confiablePrevio: true }
    );
    expect(resultado.texto).toBe("1.500");
    expect(leerMonto(resultado.texto, "COP")).toBe("1500");
  });

  it("seleccionar todo y escribir un dígito nuevo también es tecleo", () => {
    const resultado = clasificarEdicionDeMonto("1.500.000", "5", "COP", { confiablePrevio: true });
    expect(resultado.texto).toBe("5");
    expect(resultado.confiable).toBe(true);
  });

  // Hallazgo crítico de una revisión anterior: el "-" no contaba como
  // carácter significativo para el cursor, así que escribirlo y seguir
  // tecleando lo perdía o lo dejaba en un lugar donde la siguiente tecla lo
  // borraba. Con el cursor siempre al final, el signo sobrevive.
  describe("regresión: el signo no se pierde al seguir tecleando (permiteSigno)", () => {
    it("escribir el signo primero", () => {
      expect(simularTecleo("-1500", "COP", true)).toBe("-1.500");
      expect(leerMonto(simularTecleo("-1500", "COP", true).slice(1), "COP")).toBe("1500");
    });

    it("insertar el signo al principio de un monto ya escrito", () => {
      const sinSigno = simularTecleo("1500", "COP", true); // "1.500"
      const conSigno = clasificarEdicionDeMonto(sinSigno, `-${sinSigno}`, "COP", {
        permiteSigno: true,
        confiablePrevio: true,
      });
      expect(conSigno.texto).toBe("-1.500");

      // Y seguir tecleando después no debe borrar el signo.
      const siguiente = clasificarEdicionDeMonto(conSigno.texto, `${conSigno.texto}0`, "COP", {
        permiteSigno: true,
        confiablePrevio: conSigno.confiable,
      });
      expect(siguiente.texto).toBe("-15.000");
    });
  });
});

describe("clasificarEdicionDeMonto — texto ajeno (pegado, autocompletado, IME de varios caracteres)", () => {
  it("un pegado en formato inglés no se adivina, y el validador da su error real", () => {
    const resultado = simularPegado("", "1,500.50", "USD");
    expect(resultado.texto).toBe("1,500.50");
    expect(resultado.confiable).toBe(false);
  });

  it("un pegado con un único punto decimal sí se lee (misma tolerancia que el validador)", () => {
    const resultado = simularPegado("", "1500.50", "USD");
    expect(resultado.texto).toBe("1.500,50");
    expect(leerMonto(resultado.texto, "USD")).toBe("1500.50");
  });

  // Hallazgo crítico de una revisión anterior: tras pegar algo ambiguo, la
  // SIGUIENTE tecla (incluido un simple Backspace) no debe "arreglar" el
  // pegado reinterpretándolo con el algoritmo permisivo.
  describe("regresión: editar después de un pegado ambiguo nunca produce un monto silencioso distinto", () => {
    it("un Backspace después de pegar formato inglés en USD", () => {
      const pegado = simularPegado("", "1,500.50", "USD");
      expect(pegado.confiable).toBe(false);

      const conBackspace = clasificarEdicionDeMonto(
        pegado.texto,
        pegado.texto.slice(0, -1),
        "USD",
        {
          confiablePrevio: pegado.confiable,
        }
      );

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

      const conTecla = clasificarEdicionDeMonto(pegado.texto, `${pegado.texto}0`, "COP", {
        confiablePrevio: pegado.confiable,
      });

      const lectura = normalizarMontoIngresado(conTecla.texto, "COP");
      if (!("error" in lectura)) {
        throw new Error(
          `Se coló un monto silencioso: "${conTecla.texto}" se leyó como ${lectura.monto}`
        );
      }
    });

    // Hallazgo crítico: antes, "confiable" vivía en un `ref` de React que se
    // reinicia a `true` al desmontar el componente (por ejemplo, el
    // formulario que pasa de Drawer a Dialog al cruzar cierto ancho de
    // pantalla), aunque el texto ambiguo siguiera en pantalla. Simulando ese
    // "reinicio" (recalculando confiable desde cero con `confiableDe`, en
    // vez de arrastrar el valor anterior) el resultado debe seguir siendo el
    // mismo: no depende de la memoria de un componente, sino del texto.
    it('recalcular "confiable" desde cero (como tras un remount) da el mismo resultado que arrastrarlo', () => {
      const pegado = simularPegado("", "1,500.50", "USD");
      const confiableRecalculado = confiableDe(pegado.texto, "USD");
      expect(confiableRecalculado).toBe(pegado.confiable);

      const conBackspaceTrasRemount = clasificarEdicionDeMonto(
        pegado.texto,
        pegado.texto.slice(0, -1),
        "USD",
        { confiablePrevio: confiableRecalculado }
      );
      const lectura = normalizarMontoIngresado(conBackspaceTrasRemount.texto, "USD");
      if (!("error" in lectura)) {
        throw new Error(`Se coló un monto silencioso tras un remount simulado: ${lectura.monto}`);
      }
    });
  });

  it("un reemplazo de varios caracteres a la vez (autocompletado, sin inputType) también se trata como ajeno", () => {
    const resultado = clasificarEdicionDeMonto("", "1500.509", "USD", { confiablePrevio: true });
    expect(resultado.texto).toBe("1500.509");
  });

  it("pegar dentro de un campo con contenido: no se adivina, pero tampoco cuela un monto (falla con error)", () => {
    const resultado = simularPegado("1.500", "000", "COP");
    const lectura = normalizarMontoIngresado(resultado.texto, "COP");
    expect("error" in lectura).toBe(true);
  });

  it("un pegado limpio dentro de otro (que sí resulta reconocible) vuelve a quedar confiable", () => {
    const resultado = simularPegado("", "1500", "COP");
    expect(resultado.texto).toBe("1.500");
    expect(resultado.confiable).toBe(true);
  });
});

describe("clasificarEdicionDeMonto — fuerza bruta de tecleo", () => {
  /** Generador determinista: misma secuencia de "aleatorios" en cada corrida. */
  function mulberry32(semilla: number) {
    let a = semilla;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("miles de secuencias de dígitos tecleadas, con o sin un separador decimal, siempre leen el monto correcto", () => {
    const azar = mulberry32(20260916);
    let probadas = 0;

    for (let intento = 0; intento < 3000; intento++) {
      const moneda = azar() < 0.5 ? "COP" : "USD";
      const decimales = moneda === "COP" ? 0 : 2;
      const largoEntero = 1 + Math.floor(azar() * 9); // 1 a 9 dígitos
      const conDecimal = decimales > 0 && azar() < 0.5;
      const largoDecimal = conDecimal ? 1 + Math.floor(azar() * decimales) : 0;

      let entero = "";
      for (let i = 0; i < largoEntero; i++) entero += Math.floor(azar() * 10);
      if (entero[0] === "0") entero = "1" + entero.slice(1); // sin ceros a la izquierda

      let decimal = "";
      for (let i = 0; i < largoDecimal; i++) decimal += Math.floor(azar() * 10);

      const teclas = conDecimal ? `${entero}.${decimal}` : entero;
      const resultado = simularTecleo(teclas, moneda);
      const esperado = conDecimal ? `${entero}.${decimal}` : entero;

      expect(leerMonto(resultado, moneda), `tecleando "${teclas}" en ${moneda}`).toBe(esperado);
      probadas++;
    }

    expect(probadas).toBe(3000);
  });
});
