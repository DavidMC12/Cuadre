/**
 * Medición real de las tarjetas de totales del Resumen ("Tienes" y
 * "Ahorrado") y de sus esqueletos.
 *
 * jsdom no calcula layout: las pruebas fijan las clases pero no los altos.
 * Este script compila la CSS de Tailwind del proyecto contra un espejo de las
 * tarjetas, lo abre en Chromium headless por CDP a 320, 360 y 390px y mide
 * ESQUELETO vs TARJETA (undécima critique, P2): en un mes pasado la etiqueta
 * ("TENÍAS AL CIERRE DE SEPTIEMBRE DE 2026") parte en dos renglones y se suma
 * "Debías en tarjetas:", y el esqueleto de alto fijo dejaba a la tarjeta real
 * más alta que su hueso — la página saltaba al cargar. Contrato: cargando →
 * cargado, |delta| <= 2px en mes actual y mes pasado.
 *
 * El espejo NO está copiado a mano: las cadenas de clases y las etiquetas
 * salen del módulo compartido src/lib/tarjetas-totales.ts — el mismo que usan
 * total-cuentas.tsx y total-ahorrado.tsx —, así que la medición no puede
 * medirse a sí misma contra un espejo desactualizado. Solo la envoltura del
 * Card se replica como constante del módulo (el script no puede renderizar
 * React; su geometría, py-4 por lado, es la del Card real).
 *
 * Casos (los cuatro con contrato, el primero como evidencia):
 *   · cuentas-actual-con-deuda: carga FRÍA (sin lista anterior) y la tarjeta
 *     que llegará lleva deuda. El esqueleto no puede saberlo y apuesta por el
 *     mínimo: se imprime como evidencia del residual — es el único salto que
 *     queda, y no es peor que el de antes del arreglo (el bloque fijo saltaba
 *     en TODOS los casos).
 *   · cuentas-actual: carga fría sin deuda (apuesta del esqueleto = tarjeta).
 *   · cuentas-pasado-deuda / cuentas-pasado-sin-deuda: volver a un mes pasado
 *     DESDE hoy — el esqueleto usa la última lista conocida para adivinar la
 *     deuda, la etiqueta larga parte como la tarjeta.
 *   · ahorrado-actual / ahorrado-pasado: con y sin el botón de registrar
 *     (en un mes pasado el botón no existe).
 *   · controles: la fila de controles del Resumen (moneda + mes) a los tres
 *     anchos: sin desborde horizontal y cada control con su piso de 44px.
 *
 * Limitaciones, a sabiendas:
 * - La fuente es la del sistema de respaldo, más ancha que Geist: peor caso
 *   para el quiebre de la etiqueta larga.
 * - Necesita `chromium` en el PATH y no corre dentro de vitest: verificación
 *   manual de diseño. Uso: `node scripts/medir-totales-resumen.mjs`.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { registerHooks } from "node:module";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

// Los módulos compartidos se importan entre sí con el alias `@/...`: este
// hook lo resuelve para node (los imports dinámicos de abajo van después).
registerHooks({ resolve: (await import("./alias-src.mjs")).resolve });

const {
  CLASES_BOTON_AHORRADO,
  CLASES_CARD_TOTALES,
  CLASES_CONTENIDO_TOTALES,
  CLASES_DEUDA_TOTALES,
  CLASES_ETIQUETA_TOTALES,
  CLASES_FRASE_AHORRADO,
  CLASES_TEXTO_ESQUELETO,
  FRASE_AHORRADO,
  etiquetaAhorrado,
  etiquetaCuentas,
  etiquetaDeudaTarjetas,
} = await import("../src/lib/tarjetas-totales.ts");
const { etiquetaMes } = await import("../src/lib/fecha.ts");

const raizWeb = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(raizWeb, "package.json"));
const postcss = require("postcss");
const tailwindcss = require("@tailwindcss/postcss");

/** El Skeleton de ui/skeleton.tsx: las barras de texto del esqueleto. */
const CLASES_PULSANTE = "animate-pulse rounded-md bg-muted";

const MES_PASADO = "2026-09";
const MES_ACTUAL = "2026-10";
const CIFRA = "$1.250.000";
const CIFRA_DEUDA = "$800.000";
const CIFRA_AHORRADO = "$500.000";

/**
 * La tarjeta real o su esqueleto, hecha con las MISMAS cadenas que usan los
 * componentes (módulo compartido). La tarjeta y su hueso viven apilados en el
 * mismo caso, cada uno a lo ancho completo de la página, como en la columna
 * del Resumen a una sola columna.
 */
function tarjetaCuentas({ mesDeCierre, conDeuda, esqueleto }) {
  const etiqueta = etiquetaCuentas(mesDeCierre);
  const deuda = etiquetaDeudaTarjetas(mesDeCierre);
  const renglonDeuda = (envuelto) =>
    `<${envuelto ? "div" : "p"} class="${
      envuelto ? CLASES_PULSANTE + " " : ""
    }${CLASES_DEUDA_TOTALES}${envuelto ? " " + CLASES_TEXTO_ESQUELETO : ""}">${deuda} <span class="font-mono tabular-nums">${CIFRA_DEUDA}</span></${
      envuelto ? "div" : "p"
    }>`;
  const renglones = esqueleto
    ? `<div class="${CLASES_PULSANTE} ${CLASES_ETIQUETA_TOTALES} ${CLASES_TEXTO_ESQUELETO}">${etiqueta}</div>
      <div class="${CLASES_PULSANTE} h-8 w-44"></div>
      ${conDeuda ? renglonDeuda(true) : ""}`
    : `<span class="${CLASES_ETIQUETA_TOTALES}">${etiqueta}</span>
      <span class="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 text-2xl">${CIFRA}</span>
      ${conDeuda ? renglonDeuda(false) : ""}`;
  return `<div data-${esqueleto ? "hueso" : "carta"} aria-hidden="true" class="${CLASES_CARD_TOTALES}"><div class="px-4 ${CLASES_CONTENIDO_TOTALES}">${renglones}</div></div>`;
}

function tarjetaAhorrado({ mesDeCierre, esqueleto }) {
  const etiqueta = etiquetaAhorrado(mesDeCierre);
  const boton = (esqueleto) =>
    !mesDeCierre
      ? `<${esqueleto ? "div" : "div"} data-boton class="${esqueleto ? CLASES_PULSANTE + " " : ""}${CLASES_BOTON_AHORRADO} h-11 w-36">${esqueleto ? "" : "Registrar ahorro"}</div>`
      : "";
  const renglones = esqueleto
    ? `<div class="${CLASES_PULSANTE} ${CLASES_ETIQUETA_TOTALES} ${CLASES_TEXTO_ESQUELETO}">${etiqueta}</div>
      <div class="${CLASES_PULSANTE} h-8 w-44"></div>
      <div class="${CLASES_PULSANTE} ${CLASES_FRASE_AHORRADO} ${CLASES_TEXTO_ESQUELETO}">${FRASE_AHORRADO}</div>
      ${boton(true)}`
    : `<span class="${CLASES_ETIQUETA_TOTALES}">${etiqueta}</span>
      <span class="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 text-2xl">${CIFRA_AHORRADO}</span>
      <p class="${CLASES_FRASE_AHORRADO}">${FRASE_AHORRADO}</p>
      ${boton(false)}`;
  return `<div data-${esqueleto ? "hueso" : "carta"} aria-hidden="true" class="${CLASES_CARD_TOTALES}"><div class="px-4 ${CLASES_CONTENIDO_TOTALES}">${renglones}</div></div>`;
}

/**
 * La fila de controles del Resumen tal como queda en page.tsx: la moneda (con
 * su trigger de 44px de piso y w-20, como SelectTrigger) y el SelectorMes (dos
 * botones de 44px y la etiqueta del mes). El popup del Select no existe al
 * medir: el trigger vale por su caja.
 */
function filaControles() {
  return `<div data-fila class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
    <div data-control class="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
      <span class="text-muted-foreground">Mostrando</span>
      <div class="flex h-11 w-20 items-center justify-between gap-1.5 rounded-lg border border-input py-2 pr-2 pl-2.5 text-sm whitespace-nowrap"><span>COP</span></div>
    </div>
    <div data-control class="flex items-center justify-between">
      <div class="flex min-h-11 min-w-11 items-center justify-center" data-flecha>‹</div>
      <span class="text-sm font-medium">${etiquetaMes(MES_ACTUAL)}</span>
      <div class="flex min-h-11 min-w-11 items-center justify-center" data-flecha>›</div>
    </div>
  </div>`;
}

/** Un caso = escenario + ancho. Cada caso aislado: la tarjeta a lo ancho
 * completo de la columna del Resumen (px-4 de main, como la app). */
function caso(id, motivo, ancho, interior) {
  return `<div data-caso="${id}" data-motivo="${motivo}" data-ancho="${ancho}">${interior}</div>`;
}

const ANCHOS = [320, 360, 390];

const casosDeTarjetas = ANCHOS.flatMap((ancho) => {
  const pagina = (contenido) => `<main class="w-full px-4 pt-4 pb-4">${contenido}</main>`;
  return [
    // Evidencia del residual: carga fría (sin lista anterior) y la tarjeta
    // que llegará lleva deuda — el esqueleto apuesta por el mínimo.
    caso("cuentas-actual-con-deuda", "evidencia", ancho,
      pagina(tarjetaCuentas({ mesDeCierre: undefined, conDeuda: false, esqueleto: true }) + tarjetaCuentas({ mesDeCierre: undefined, conDeuda: true, esqueleto: false }))),
    caso("cuentas-actual", "contrato", ancho,
      pagina(tarjetaCuentas({ mesDeCierre: undefined, conDeuda: false, esqueleto: true }) + tarjetaCuentas({ mesDeCierre: undefined, conDeuda: false, esqueleto: false }))),
    // Volver a un mes pasado desde hoy: la lista de referencia (la de hoy)
    // decide el renglón de deuda del esqueleto.
    caso("cuentas-pasado-deuda", "contrato", ancho,
      pagina(tarjetaCuentas({ mesDeCierre: MES_PASADO, conDeuda: true, esqueleto: true }) + tarjetaCuentas({ mesDeCierre: MES_PASADO, conDeuda: true, esqueleto: false }))),
    caso("cuentas-pasado-sin-deuda", "contrato", ancho,
      pagina(tarjetaCuentas({ mesDeCierre: MES_PASADO, conDeuda: false, esqueleto: true }) + tarjetaCuentas({ mesDeCierre: MES_PASADO, conDeuda: false, esqueleto: false }))),
    caso("ahorrado-actual", "contrato", ancho,
      pagina(tarjetaAhorrado({ mesDeCierre: undefined, esqueleto: true }) + tarjetaAhorrado({ mesDeCierre: undefined, esqueleto: false }))),
    caso("ahorrado-pasado", "contrato", ancho,
      pagina(tarjetaAhorrado({ mesDeCierre: MES_PASADO, esqueleto: true }) + tarjetaAhorrado({ mesDeCierre: MES_PASADO, esqueleto: false }))),
    caso("controles", "controles", ancho,
      pagina(filaControles() + filaControles())),
  ];
});

const HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="./totales.css"></head>
<body>
${casosDeTarjetas.join("\n")}
</body></html>`;

async function compilarCss(directorio) {
  const entradaTailwind = join(dirname(require.resolve("tailwindcss/package.json")), "index.css");
  // La CSS real del proyecto; se le inyecta el `@source` del espejo.
  const globals = (await readFile(join(raizWeb, "src/app/globals.css"), "utf8"))
    .replace('@import "tw-animate-css";', "")
    .replace('@import "shadcn/tailwind.css";', "");
  const fuente = join(directorio, "index.html").replace(/\\/g, "/");
  const css = globals.replace(
    '@import "tailwindcss";',
    `@import "${entradaTailwind}" source(none);\n@source "${fuente}";`
  );
  const resultado = await postcss([tailwindcss()]).process(css, {
    from: join(directorio, "totales.css"),
  });
  return resultado.css;
}

async function abrirChromium() {
  const proceso = spawn(
    "chromium",
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  try {
    const urlDepurador = await new Promise((resuelto, rechazado) => {
      let resto = "";
      proceso.stderr.on("data", (pedazo) => {
        resto += pedazo.toString();
        const linea = resto.split("\n").find((l) => l.includes("DevTools listening on"));
        if (linea) {
          const ws = linea.match(/ws:\/\/\S+/)?.[0];
          if (ws) resuelto(ws);
          else rechazado(new Error("No se encontró el endpoint de Chromium."));
        }
      });
      proceso.on("error", (error) => {
        rechazado(
          error.code === "ENOENT"
            ? new Error("Chromium no está en el PATH: este script lo necesita para medir.")
            : error
        );
      });
      proceso.on("exit", () => rechazado(new Error("Chromium se cerró antes de abrir el canal.")));
    });
    const puerto = new URL(urlDepurador).port;
    const objetivos = await new Promise((resuelto, rechazado) => {
      http
        .get({ host: "127.0.0.1", port: puerto, path: "/json/list" }, (respuesta) => {
          let cuerpo = "";
          respuesta.on("data", (pedazo) => (cuerpo += pedazo));
          respuesta.on("end", () => resuelto(JSON.parse(cuerpo)));
        })
        .on("error", rechazado);
    });
    const pagina = objetivos.find((o) => o.type === "page");
    if (!pagina) throw new Error("Chromium no trajo ninguna página para depurar.");
    return { proceso, ws: new WebSocket(pagina.webSocketDebuggerUrl) };
  } catch (error) {
    proceso.kill("SIGKILL");
    throw error;
  }
}

function pedir(ws, id, metodo, params = {}) {
  return new Promise((resuelto, rechazado) => {
    const alarma = setTimeout(() => rechazado(new Error(`${metodo} nunca respondió.`)), 15_000);
    const escuchar = (evento) => {
      const mensaje = JSON.parse(evento.data);
      if (mensaje.id === id) {
        clearTimeout(alarma);
        ws.removeEventListener("message", escuchar);
        if (mensaje.error) rechazado(new Error(`${metodo}: ${JSON.stringify(mensaje.error)}`));
        else resuelto(mensaje.result);
      }
    };
    ws.addEventListener("message", escuchar);
    ws.send(JSON.stringify({ id, method: metodo, params }));
  });
}

function esperarEvento(ws, metodo, limiteMs = 15_000) {
  return new Promise((resuelto, rechazado) => {
    const alarma = setTimeout(() => rechazado(new Error(`${metodo} nunca llegó.`)), limiteMs);
    ws.addEventListener("message", function escuchar(evento) {
      const mensaje = JSON.parse(evento.data);
      if (mensaje.method === metodo) {
        clearTimeout(alarma);
        ws.removeEventListener("message", escuchar);
        resuelto(mensaje.params);
      }
    });
  });
}

const MEDICION = `(() => [...document.querySelectorAll("[data-caso]")].map((caso) => {
  const base = {
    id: caso.dataset.caso,
    motivo: caso.dataset.motivo,
    ancho: Number(caso.dataset.ancho),
    desbordeX: caso.scrollWidth - caso.clientWidth,
  };
  if (caso.dataset.motivo === "controles") {
    const fila = caso.querySelector("[data-fila]");
    const controles = [...caso.querySelectorAll("[data-control]")];
    return {
      ...base,
      filaAlto: fila.offsetHeight,
      pisoDeControles: Math.min(...controles.map((c) => c.offsetHeight)),
      // El ancho que ocupan los dos controles en la MISMA línea, si caben.
      juntos: controles[0].getBoundingClientRect().top === controles[1].getBoundingClientRect().top,
    };
  }
  const hueso = caso.querySelector("[data-hueso]");
  const carta = caso.querySelector("[data-carta]");
  return {
    ...base,
    huesoAlto: hueso.offsetHeight,
    cartaAlto: carta.offsetHeight,
    delta: hueso.offsetHeight - carta.offsetHeight,
  };
}))()`;

let fallos = 0;

function revisar(mediciones) {
  for (const ancho of ANCHOS) {
    console.log(`\n${ancho}px:`);
    for (const m of mediciones.filter((x) => x.ancho === ancho)) {
      if (m.motivo === "controles") {
        const resumen =
          `fila ${m.filaAlto}px; piso mínimo de controles ${m.pisoDeControles}px; ` +
          `controles juntos en una línea: ${m.juntos ? "sí" : "no (envuelven)"}; desborde-x ${m.desbordeX}px`;
        if (m.desbordeX > 0) {
          fallos += 1;
          console.log(`  ✗ controles: ${resumen} → desborda en horizontal`);
        } else if (m.pisoDeControles < 44) {
          fallos += 1;
          console.log(`  ✗ controles: ${resumen} → control bajo el piso de 44px`);
        } else {
          console.log(`  ✓ controles: ${resumen}`);
        }
        continue;
      }
      const resumen =
        `esqueleto ${m.huesoAlto}px; tarjeta ${m.cartaAlto}px; delta ${m.delta}px; desborde-x ${m.desbordeX}px`;
      if (m.motivo === "evidencia") {
        console.log(`  · evidencia (carga fría con deuda): ${resumen}`);
        if (Math.abs(m.delta) <= 2) {
          fallos += 1;
          console.log("    ? el residual dejó de reproducirse: el espejo habría dejado de ser fiel");
        }
        continue;
      }
      if (m.desbordeX > 0) {
        fallos += 1;
        console.log(`  ✗ ${m.id}: ${resumen} → desborda en horizontal`);
      } else if (Math.abs(m.delta) > 2) {
        fallos += 1;
        console.log(`  ✗ ${m.id}: ${resumen} → el salto carga→cargado supera los 2px`);
      } else {
        console.log(`  ✓ ${m.id}: ${resumen}`);
      }
    }
  }
}

const directorio = await mkdtemp(join(tmpdir(), "totales-resumen-"));
try {
  await writeFile(join(directorio, "index.html"), HTML);
  await writeFile(join(directorio, "totales.css"), await compilarCss(directorio));

  console.log("Chromium headless: tarjetas de totales del Resumen (esqueleto vs tarjeta) y fila de controles.");
  const { proceso, ws } = await abrirChromium();
  try {
    await new Promise((resuelto, rechazado) => {
      ws.addEventListener("open", resuelto, { once: true });
      ws.addEventListener("error", () => rechazado(new Error("No se pudo abrir el canal CDP.")));
    });
    await pedir(ws, 1, "Page.enable");
    await pedir(ws, 2, "Page.navigate", { url: `file://${join(directorio, "index.html")}` });
    await esperarEvento(ws, "Page.loadEventFired");

    const mediciones = [];
    for (const [indice, ancho] of ANCHOS.entries()) {
      const id = 3 + indice * 2;
      await pedir(ws, id, "Emulation.setDeviceMetricsOverride", {
        width: ancho,
        height: 480,
        deviceScaleFactor: 1,
        mobile: ancho < 400,
      });
      const { result } = await pedir(ws, id + 1, "Runtime.evaluate", {
        expression: MEDICION,
        returnByValue: true,
      });
      mediciones.push(...result.value.filter((m) => m.ancho === ancho));
    }
    revisar(mediciones);
  } finally {
    proceso.kill("SIGKILL");
  }

  if (fallos > 0) {
    console.error(`\n${fallos} medición(es) fuera de contrato.`);
    process.exitCode = 1;
  } else {
    console.log("\nContrato cumplido en los tres anchos: el esqueleto mide lo mismo que la tarjeta (±2px) y los controles no desbordan.");
  }
} finally {
  await rm(directorio, { recursive: true, force: true });
}
