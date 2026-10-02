/**
 * Medición real del aside del Resumen (page.tsx, columna xl) a 1280×700.
 *
 * El aside es `xl:sticky xl:top-8` y contiene el cuadrito "cuánto me sobra"
 * más el panel de presupuesto. En una laptop de ~700px de alto, sin scroll
 * propio, la suma pasaba el alto de la ventana y el pie quedaba inalcanzable
 * (sticky no deja scrollear lo que se sale). Este script compila la CSS de
 * Tailwind del proyecto contra un espejo del aside y mide en Chromium headless
 * por CDP que:
 *
 *   1. el aside no se sale del alto de la ventana sin salida: o cabe, o tiene
 *      scroll propio (`max-h` + `overflow-y-auto`);
 *   2. con scroll propio, NO hay doble scroll con el panel de dentro (el panel
 *      cede su tope cuando el aside ya scrollea);
 *   3. el pie del panel (su último renglón) es alcanzable: con el aside
 *      scrolleado hasta abajo, el fondo del contenido queda a la vista.
 *
 * Se mide "antes" (aside sin scroll, panel con su `max-h-[70vh]`) y "después"
 * (aside con scroll, panel sin tope): solo "después" entra en el contrato,
 * "antes" se imprime como evidencia del defecto.
 *
 * Uso: `node scripts/medir-aside-resumen.mjs` (necesita chromium en el PATH).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const raizWeb = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(raizWeb, "package.json"));
const postcss = require("postcss");
const tailwindcss = require("@tailwindcss/postcss");

const ALTO_VENTANA = 700;
const ANCHO_VENTANA = 1280;

/** El cuadrito de arriba: título + cifra + real (alto parecido al real). */
const CUADRITO = `
  <div data-card class="rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">
    <div class="font-heading text-base font-medium">Cuánto me sobra este mes</div>
    <div class="mt-2 font-mono text-2xl">$1.000.000</div>
    <p class="mt-2 text-sm text-muted-foreground">Hasta hoy: $500.000</p>
    <p class="mt-1 text-sm font-medium">Te sobran según lo previsto.</p>
  </div>`;

/** El panel: muchos renglones para que de verdad desborde. */
function renglon(texto) {
  return `
  <li class="rounded-lg border-t border-border px-2 py-3">
    <div class="text-sm font-medium">${texto}</div>
    <div class="mt-1 h-1.5 w-full rounded-full bg-muted"><div class="h-full rounded-full bg-foreground/60" style="width:60%"></div></div>
  </li>`;
}

function panel(conTope) {
  return `
  <div class="rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10" data-panel>
    <div class="font-heading text-base font-medium">Presupuesto del mes</div>
    <div data-region class="flex flex-col overflow-y-auto pr-1 ${conTope ? "max-h-[70vh]" : ""}">
      <ul class="flex flex-col">
        ${Array.from({ length: 14 }, (_, i) => renglon(`Categoría ${i + 1}`)).join("")}
      </ul>
      <div data-pie class="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">Archivados (2)</div>
    </div>
  </div>`;
}

function caso(id, variante) {
  const conTopeDelPanel = variante === "antes";
  const clasesAside =
    variante === "antes"
      ? "flex w-80 shrink-0 flex-col gap-5 xl:sticky xl:top-8"
      : "flex w-80 shrink-0 flex-col gap-5 xl:sticky xl:top-8 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto";
  return `<div data-caso="${id}" data-variante="${variante}">${`<aside data-aside class="${clasesAside}">${CUADRITO}${panel(conTopeDelPanel)}</aside>`}</div>`;
}

const HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="./aside.css"></head>
<body class="p-8">
${caso("antes", "antes")}
${caso("despues", "despues")}
</body></html>`;

const CSS = `@import "tailwindcss" source(none);\n@source "./index.html";\n`;

async function compilarCss(directorio) {
  const entradaTailwind = join(dirname(require.resolve("tailwindcss/package.json")), "index.css");
  const resultado = await postcss([tailwindcss()]).process(
    CSS.replace("./index.html", join(directorio, "index.html")).replace("tailwindcss", entradaTailwind),
    { from: join(directorio, "aside.css") }
  );
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
      proceso.on("error", (error) =>
        rechazado(error.code === "ENOENT" ? new Error("Chromium no está en el PATH.") : error)
      );
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
    if (!pagina) throw new Error("Chromium no trajo ninguna página.");
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

// Mide cada caso con el viewport real: el aside es sticky, así que se compara
// la altura de su caja contra el alto de la ventana, y cuántos contenedores
// con scroll propio hay dentro.
const MEDICION = `(() => {
  const altoVentana = window.innerHeight;
  return [...document.querySelectorAll("[data-caso]")].map((caso) => {
    const aside = caso.querySelector("[data-aside]");
    const region = caso.querySelector("[data-region]");
    const scrollables = [caso, ...caso.querySelectorAll("*")].filter(
      (el) => el.scrollHeight - el.clientHeight > 1
    ).length;
    return {
      id: caso.dataset.caso,
      variante: caso.dataset.variante,
      altoVentana,
      altoAside: aside.scrollHeight,
      altoCajaAside: aside.clientHeight,
      overflowY: getComputedStyle(aside).overflowY,
      // El caso es el contenedor de primer nivel; su ancho debe ser el del
      // aside (w-80) y su alto el del contenido, no el de la ventana.
      rectCaso: Math.round(caso.getBoundingClientRect().height),
      asideConScroll: aside.scrollHeight - aside.clientHeight > 1,
      regionConScroll: region.scrollHeight - region.clientHeight > 1,
      scrollables,
    };
  });
})()`;

let fallos = 0;

function revisar(mediciones, pie) {
  for (const m of mediciones) {
    const resumen =
      `alto del aside ${m.altoAside}px (caja ${m.altoCajaAside}px, overflow ${m.overflowY}, caso ${m.rectCaso}px) ` +
      `en ventana ${m.altoVentana}px; scroll propio del aside ${m.asideConScroll}; ` +
      `región con scroll ${m.regionConScroll}; contenedores con scroll ${m.scrollables}`;
    if (m.variante === "antes") {
      console.log(`  · antes:   ${resumen}`);
      if (m.altoAside <= m.altoVentana) {
        fallos += 1;
        console.log("    ✗ el defecto (aside más alto que la ventana) ya no se reproduce");
      }
      continue;
    }
    const problemas = [];
    if (m.altoAside > m.altoVentana && !m.asideConScroll)
      problemas.push("el aside no cabe y no tiene scroll propio");
    if (m.regionConScroll)
      problemas.push("el panel de dentro conserva su propio scroll (doble scroll)");
    if (pie && !pie.visible) problemas.push("el pie no se alcanza ni con el aside al fondo");
    if (problemas.length > 0) {
      fallos += 1;
      console.log(`  ✗ después: ${resumen} → ${problemas.join("; ")}`);
      if (pie) {
        console.log(
          `      pie: top ${pie.topPie}px, bottom ${pie.bottomPie}px (ventana ${pie.altoVentana}px)`
        );
      }
    } else {
      console.log(`  ✓ después: ${resumen}`);
    }
  }
}

const directorio = await mkdtemp(join(tmpdir(), "aside-resumen-"));
try {
  await writeFile(join(directorio, "index.html"), HTML);
  await writeFile(join(directorio, "aside.css"), await compilarCss(directorio));

  console.log(`Chromium headless a ${ANCHO_VENTANA}×${ALTO_VENTANA} (laptop):`);
  const { proceso, ws } = await abrirChromium();
  try {
    await new Promise((resuelto, rechazado) => {
      ws.addEventListener("open", resuelto, { once: true });
      ws.addEventListener("error", () => rechazado(new Error("No se pudo abrir el canal CDP.")));
    });
    await pedir(ws, 1, "Page.enable");
    await pedir(ws, 2, "Page.navigate", { url: `file://${join(directorio, "index.html")}` });
    await esperarEvento(ws, "Page.loadEventFired");
    await pedir(ws, 3, "Emulation.setDeviceMetricsOverride", {
      width: ANCHO_VENTANA,
      height: ALTO_VENTANA,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const { result } = await pedir(ws, 4, "Runtime.evaluate", {
      expression: MEDICION,
      returnByValue: true,
    });
    await pedir(ws, 5, "Runtime.evaluate", {
      expression: `(() => { const p = document.querySelector('[data-caso="despues"] [data-pie]'); p.scrollIntoView({ block: 'end' }); return true; })()`,
      returnByValue: true,
    });
    const { result: pieVisible } = await pedir(ws, 6, "Runtime.evaluate", {
      expression: `(() => {
        const pie = document.querySelector('[data-caso="despues"] [data-pie]');
        const r = pie.getBoundingClientRect();
        return { visible: r.top >= -1 && r.bottom <= window.innerHeight + 1, topPie: Math.round(r.top), bottomPie: Math.round(r.bottom), altoVentana: window.innerHeight };
      })()`,
      returnByValue: true,
    });
    revisar(result.value, pieVisible.value);
  } finally {
    proceso.kill("SIGKILL");
  }

  if (fallos > 0) {
    console.error(`\n${fallos} medición(es) fuera de contrato.`);
    process.exitCode = 1;
  } else {
    console.log("\nContrato cumplido: el aside entra en la ventana con scroll propio, sin doble scroll y con el pie alcanzable.");
  }
} finally {
  await rm(directorio, { recursive: true, force: true });
}
