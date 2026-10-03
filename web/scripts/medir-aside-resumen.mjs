/**
 * Medición real del aside del Resumen (page.tsx, columna xl) a 1280×700.
 *
 * El aside es `xl:sticky xl:top-8` con tope `max-h-[calc(100vh-2rem)]` y
 * `overflow-y-auto`, y contiene el cuadrito "cuánto me sobra" más el panel de
 * presupuesto agrupado. El defecto que este script vigila: sus hijos directos
 * son flex items con `min-height: auto`, pero como las Cards llevan
 * `overflow-hidden`, el mínimo automático cae a 0 y el flex los ENCOGE en vez
 * de dejarlos desbordar. Resultado: el aside nunca scrollea de verdad, el
 * cuadrito sale recortado y los últimos renglones de un grupo abierto no se
 * alcanzan.
 *
 * A diferencia de la versión anterior, este script NO replica las clases a
 * mano: importa `src/lib/aside-resumen.ts`, el MISMO módulo que usan
 * page.tsx, cuanto-me-sobra.tsx y panel-presupuesto.tsx. El caso "después"
 * mide las clases reales exportadas; el caso "antes" conserva las clases
 * viejas como evidencia de que el defecto existía. Si alguien quita el
 * `shrink-0` del módulo, la medición lo ve.
 *
 * Escenario: 2 grupos abiertos de 7 ítems cada uno. Comprueba que
 *   1. el cuadrito tiene caja >= su contenido (no se corta);
 *   2. el cuadrito entero es visible dentro del aside sin scrollear;
 *   3. el aside scrollea (el contenido supera la ventana);
 *   4. hay UN solo contenedor con scroll: el aside, ni la región del panel ni
 *      las Cards;
 *   5. el último renglón se alcanza con el aside al fondo;
 *   6. si el encabezado de grupo trae `sticky`, queda pegado arriba al
 *      recorrer los ítems dentro del scroll del aside.
 *
 * Uso: `npm run medir:aside` (necesita chromium en el PATH).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

import {
  CLASES_ASIDE,
  CLASES_BLOQUE_ASIDE,
  CLASES_CARD_PANEL_ASIDE,
  CLASES_REGION_PANEL,
  CLASES_REGION_PANEL_CON_TOPE,
  CLASES_ENCABEZADO_GRUPO,
} from "../src/lib/aside-resumen.ts";

const raizWeb = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(raizWeb, "package.json"));
const postcss = require("postcss");
const tailwindcss = require("@tailwindcss/postcss");

const ALTO_VENTANA = 700;
const ANCHO_VENTANA = 1280;
const ITEMS_POR_GRUPO = 7;

/**
 * Las clases del caso. "despues" usa las reales del módulo compartido; "antes"
 * conserva las viejas (sin `shrink-0` en las Cards) para probar que el defecto
 * existía y que el script sabe reproducirlo.
 */
const CLASES_VIEJAS = {
  aside:
    "flex w-80 shrink-0 flex-col gap-5 xl:sticky xl:top-8 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto",
  bloque: "",
  cardPanel: "",
  region:
    "flex flex-col overflow-y-auto pr-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85",
  header:
    "flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85",
};

const CLASES_REALES = {
  aside: CLASES_ASIDE,
  bloque: CLASES_BLOQUE_ASIDE,
  cardPanel: CLASES_CARD_PANEL_ASIDE,
  region: [CLASES_REGION_PANEL, CLASES_REGION_PANEL_CON_TOPE].join(" "),
  header: CLASES_ENCABEZADO_GRUPO,
};

function clasesDe(variante) {
  return variante === "antes" ? CLASES_VIEJAS : CLASES_REALES;
}

function renglon(texto, ultimo) {
  return `
  <li data-fila${ultimo ? " data-ultimo" : ""} class="rounded-lg border-t border-border px-2 py-3">
    <div class="text-sm font-medium">${texto}</div>
    <div class="mt-1 h-1.5 w-full rounded-full bg-muted"><div class="h-full rounded-full bg-foreground/60" style="width:60%"></div></div>
    <p class="text-xs text-muted-foreground"><span class="font-mono tabular-nums">$20.500</span> de <span class="font-mono tabular-nums">$30.000</span></p>
  </li>`;
}

function grupo(titulo, cantidad, clasesHeader, ultimoGrupo) {
  return `
  <div>
    <button data-grupo class="${clasesHeader}">
      <span aria-hidden class="size-2.5 shrink-0 rounded-full" style="background-color:#2a78d6"></span>
      <span class="min-w-0 flex-1 truncate">${titulo}</span>
      <span class="tabular-nums">${cantidad}</span>
      <svg aria-hidden class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <ul class="flex flex-col">
      ${Array.from({ length: cantidad }, (_, i) =>
        renglon(`${titulo} ${i + 1}`, ultimoGrupo && i === cantidad - 1)
      ).join("")}
    </ul>
  </div>`;
}

function caso(id, variante) {
  const c = clasesDe(variante);
  const cardBase =
    "flex flex-col overflow-hidden rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10";
  return `<div data-caso="${id}" data-variante="${variante}">
    <aside data-aside class="${c.aside}">
      <div data-card-sobra class="${cardBase} ${c.bloque}">
        <div class="font-heading text-base font-medium">Cuánto me sobra este mes</div>
        <div class="mt-2 font-mono text-2xl">$1.000.000</div>
        <p class="mt-2 text-sm text-muted-foreground">Hasta hoy: <span class="font-mono">$0</span></p>
        <p class="mt-1 text-sm font-medium">Ni te sobra ni te falta este mes.</p>
      </div>
      <div data-panel class="${cardBase} ${c.bloque} ${c.cardPanel}">
        <div class="font-heading text-base font-medium">Presupuesto del mes</div>
        <div data-region class="${c.region}">
          <section class="flex flex-col">
            <h3 class="px-2 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Gastos</h3>
            ${grupo("Hogar", ITEMS_POR_GRUPO, c.header, false)}
            ${grupo("Transporte", ITEMS_POR_GRUPO, c.header, true)}
          </section>
        </div>
      </div>
    </aside>
  </div>`;
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

const MEDICION_BASE = `(() => [...document.querySelectorAll("[data-caso]")].map((caso) => {
  const aside = caso.querySelector("[data-aside]");
  const card = caso.querySelector("[data-card-sobra]");
  const region = caso.querySelector("[data-region]");
  const a = aside.getBoundingClientRect();
  const c = card.getBoundingClientRect();
  const scrollables = [caso, ...caso.querySelectorAll("*")].filter(
    (el) => el.scrollHeight - el.clientHeight > 1
  ).length;
  return {
    id: caso.dataset.caso,
    variante: caso.dataset.variante,
    altoVentana: window.innerHeight,
    altoCajaSobra: card.clientHeight,
    altoContenidoSobra: card.scrollHeight,
    sobraVisible: c.top >= a.top - 1 && c.bottom <= a.bottom + 1,
    altoAside: aside.scrollHeight,
    altoCajaAside: aside.clientHeight,
    asideConScroll: aside.scrollHeight - aside.clientHeight > 1,
    regionConScroll: region.scrollHeight - region.clientHeight > 1,
    regionOverflowY: getComputedStyle(region).overflowY,
    scrollables,
  };
}))()`;

// Al fondo del aside: el último renglón debe quedar dentro de la caja del aside.
const MEDICION_PIE = `(() => {
  document.querySelectorAll("[data-aside]").forEach((a) => { a.scrollTop = a.scrollHeight; });
  return [...document.querySelectorAll("[data-caso]")].map((caso) => {
    const aside = caso.querySelector("[data-aside]");
    const ultimo = caso.querySelector("[data-ultimo]");
    const a = aside.getBoundingClientRect();
    const r = ultimo.getBoundingClientRect();
    return {
      id: caso.dataset.caso,
      visible: r.top >= a.top - 1 && r.bottom <= a.bottom + 1,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      asideTop: Math.round(a.top),
      asideBottom: Math.round(a.bottom),
    };
  });
})()`;

// Con el encabezado del primer grupo un poco por encima del borde superior del
// scrollport, sticky debe sostenerlo ahí (top del encabezado == top del aside).
const MEDICION_STICKY = `(() => [...document.querySelectorAll("[data-caso]")].map((caso) => {
  const aside = caso.querySelector("[data-aside]");
  const header = caso.querySelector("[data-grupo]");
  const delta = header.getBoundingClientRect().top - aside.getBoundingClientRect().top;
  aside.scrollTop += delta + 20;
  const a = aside.getBoundingClientRect();
  const r = header.getBoundingClientRect();
  return {
    id: caso.dataset.caso,
    pegado: Math.abs(r.top - a.top) <= 1,
    topHeader: Math.round(r.top),
    topAside: Math.round(a.top),
  };
}))()`;

let fallos = 0;

function revisar(base, pie, sticky) {
  for (const m of base) {
    const resumen =
      `cuadro ${m.altoCajaSobra}px (contenido ${m.altoContenidoSobra}px), visible ${m.sobraVisible}; ` +
      `aside ${m.altoAside}px (caja ${m.altoCajaAside}px) en ventana ${m.altoVentana}px; ` +
      `scroll propio ${m.asideConScroll}; región con scroll ${m.regionConScroll} ` +
      `(overflow-y ${m.regionOverflowY}); contenedores con scroll ${m.scrollables}`;
    const delPie = pie.find((p) => p.id === m.id);
    const delSticky = sticky.find((s) => s.id === m.id);
    const haySticky = clasesDe(m.variante).header.includes("sticky");

    if (m.variante === "antes") {
      console.log(`  · antes:   ${resumen}`);
      const corta = m.altoCajaSobra < m.altoContenidoSobra - 1;
      if (!corta && m.asideConScroll) {
        fallos += 1;
        console.log("    ✗ el defecto (cuadro cortado / aside sin scroll) ya no se reproduce");
      }
      continue;
    }

    const problemas = [];
    if (m.altoCajaSobra < m.altoContenidoSobra - 1)
      problemas.push(`el cuadro se corta (${m.altoCajaSobra}px < contenido ${m.altoContenidoSobra}px)`);
    if (!m.sobraVisible) problemas.push("el cuadro no entra en el aside");
    if (m.altoAside > m.altoCajaAside && !m.asideConScroll)
      problemas.push("el aside no scrollea");
    if (m.regionConScroll) problemas.push("la región del panel conserva scroll propio (anidado)");
    if (m.scrollables !== 1)
      problemas.push(`hay ${m.scrollables} contenedores con scroll (debe haber 1: el aside)`);
    if (delPie && !delPie.visible)
      problemas.push(
        `el último renglón no se alcanza (top ${delPie.top}, bottom ${delPie.bottom} vs aside ${delPie.asideTop}–${delPie.asideBottom})`
      );
    if (haySticky && delSticky && !delSticky.pegado)
      problemas.push(
        `el encabezado no se pega arriba (top ${delSticky.topHeader} vs aside ${delSticky.topAside})`
      );

    if (problemas.length > 0) {
      fallos += 1;
      console.log(`  ✗ después: ${resumen} → ${problemas.join("; ")}`);
    } else {
      console.log(`  ✓ después: ${resumen}`);
      if (delPie) console.log(`      último renglón alcanzado (bottom ${delPie.bottom}).`);
      if (haySticky && delSticky) console.log(`      encabezado pegado arriba (top ${delSticky.topHeader}).`);
    }
  }
}

const directorio = await mkdtemp(join(tmpdir(), "aside-resumen-"));
try {
  await writeFile(join(directorio, "index.html"), HTML);
  await writeFile(join(directorio, "aside.css"), await compilarCss(directorio));

  console.log(
    `Chromium headless a ${ANCHO_VENTANA}×${ALTO_VENTANA} con 2 grupos abiertos de ${ITEMS_POR_GRUPO} ítems:`
  );
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
    const { result: baseLimpia } = await pedir(ws, 4, "Runtime.evaluate", {
      expression: MEDICION_BASE,
      returnByValue: true,
    });
    const { result: sticky } = await pedir(ws, 5, "Runtime.evaluate", {
      expression: MEDICION_STICKY,
      returnByValue: true,
    });
    const { result: pie } = await pedir(ws, 6, "Runtime.evaluate", {
      expression: MEDICION_PIE,
      returnByValue: true,
    });
    revisar(baseLimpia.value, pie.value, sticky.value);
  } finally {
    proceso.kill("SIGKILL");
  }

  if (fallos > 0) {
    console.error(`\n${fallos} medición(es) fuera de contrato.`);
    process.exitCode = 1;
  } else {
    console.log(
      "\nContrato cumplido: el cuadro entra completo, el aside scrollea solo, el pie se alcanza" +
        (CLASES_ENCABEZADO_GRUPO.includes("sticky") ? " y el encabezado queda pegado." : ".")
    );
  }
} finally {
  await rm(directorio, { recursive: true, force: true });
}
