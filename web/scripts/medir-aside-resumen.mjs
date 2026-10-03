/**
 * Medición real del aside del Resumen (page.tsx, columna xl) a 1280×700.
 *
 * Contrato nuevo (lo pidió el dueño tras ver la pantalla):
 *
 *   1. el aside NO scrollea: solo scrollea la lista del presupuesto, dentro de
 *      su tarjeta;
 *   2. la tarjeta entera del presupuesto (título, Agregar, alternar, lista,
 *      pie) cabe en la ventana a 1280×700: su pie se alcanza sin scrollear la
 *      página;
 *   3. hay UN solo contenedor con scroll: la región de la lista;
 *   4. con la barra de scroll presente, ni la tarjeta ni el encabezado
 *      desbordan en horizontal (scrollWidth ≤ clientWidth) y "Agregar" se ve
 *      completo y de 44px; la lista reserva el carril (`scrollbar-gutter`);
 *   5. los encabezados de grupo se pegan arriba dentro del scroll de la lista.
 *
 * Importa las clases reales de `src/lib/aside-resumen.ts` (el mismo módulo que
 * usan page.tsx y panel-presupuesto.tsx), pasa las de Card por `cn` (el mismo
 * merge del componente) y compila la CSS real de `globals.css` para que la
 * barra fina (`scroll-fino`) y sus tokens entren en la medición. El caso
 * "antes" conserva el comportamiento viejo (el aside con scroll propio y la
 * tarjeta sin caber) como evidencia de que el script sabe reproducirlo.
 *
 * Uso: `npm run medir:aside` (necesita chromium en el PATH).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

import {
  CLASES_ASIDE,
  CLASES_BLOQUE_ASIDE,
  CLASES_CARD_PANEL_VENTANA,
  CLASES_REGION_PANEL,
  CLASES_REGION_PANEL_VENTANA,
  CLASES_ENCABEZADO_GRUPO,
  CLASES_ENCABEZADO_GRUPO_FIJO,
} from "../src/lib/aside-resumen.ts";
import { cn } from "cn";

const raizWeb = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(raizWeb, "package.json"));
const postcss = require("postcss");
const tailwindcss = require("@tailwindcss/postcss");

const ALTO_VENTANA = 700;
const ANCHO_VENTANA = 1280;
const ITEMS_POR_GRUPO = 7;

// Base real de Card/CardHeader/CardContent (card.tsx) + botones (button.tsx),
// recortadas a lo geométrico. Mismo `cn` que el componente para el reparto.
const CARD =
  "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)]";
const CARD_HEADER =
  "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto]";
const CARD_CONTENT = "px-(--card-spacing)";
const BTN =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[0.8rem] font-medium";
const BTN_OUTLINE = cn(BTN, "border border-border bg-background");
const BTN_GHOST = cn(BTN, "text-foreground");

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

function lista(clasesHeader) {
  return `
    <section class="flex flex-col">
      <h3 class="px-2 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Gastos</h3>
      ${grupo("Hogar", ITEMS_POR_GRUPO, clasesHeader, false)}
      ${grupo("Transporte", ITEMS_POR_GRUPO, clasesHeader, true)}
    </section>`;
}

/** Encabezado viejo: título + alternar + Agregar apretados en una fila. */
function encabezadoApretado() {
  return `
  <div data-header class="${CARD_HEADER}">
    <div class="font-heading text-base leading-snug font-medium">Presupuesto del mes</div>
    <div data-slot="card-action" class="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
      <div class="flex items-center gap-1">
        <button data-alternar class="${BTN_GHOST}">Contraer todo</button>
        <button data-agregar class="${BTN_OUTLINE}">Agregar</button>
      </div>
    </div>
  </div>`;
}

/** Encabezado nuevo: título con Agregar a la derecha; alternar en su fila. */
function encabezadoSereno() {
  return `
  <div data-header class="${CARD_HEADER} shrink-0">
    <div class="min-w-0 truncate font-heading text-base leading-snug font-medium">Presupuesto del mes</div>
    <div data-slot="card-action" class="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
      <button data-agregar class="${BTN_OUTLINE}">Agregar</button>
    </div>
  </div>`;
}

function caso(id, variante) {
  const antes = variante === "antes";
  const clasesAside = antes
    ? "flex w-80 shrink-0 flex-col gap-5 xl:sticky xl:top-8 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto"
    : CLASES_ASIDE;
  const clasesCard = antes
    ? cn(CARD, "shrink-0")
    : cn(CARD, CLASES_BLOQUE_ASIDE, CLASES_CARD_PANEL_VENTANA);
  const clasesContenido = antes ? CARD_CONTENT : cn(CARD_CONTENT, "flex min-h-0 flex-1 flex-col");
  const clasesRegion = antes
    ? "flex flex-col overflow-y-auto pr-1"
    : cn(CLASES_REGION_PANEL, CLASES_REGION_PANEL_VENTANA);
  const clasesHeader = antes ? CLASES_ENCABEZADO_GRUPO : cn(CLASES_ENCABEZADO_GRUPO, CLASES_ENCABEZADO_GRUPO_FIJO);

  return `<div data-caso="${id}" data-variante="${variante}" class="p-8">
    <aside data-aside class="${clasesAside}">
      <div data-card class="${clasesCard}">
        ${antes ? encabezadoApretado() : encabezadoSereno()}
        <div data-content class="${clasesContenido}">
          ${antes
            ? ""
            : `<div class="flex shrink-0 justify-end pb-1"><button data-alternar class="${BTN_GHOST}">Contraer todo</button></div>`}
          <div data-region role="region" aria-label="Ítems del presupuesto" tabindex="0" class="${clasesRegion}">
            ${lista(clasesHeader)}
          </div>
          <div data-pie class="mt-3 shrink-0 border-t border-border pt-3 text-xs text-muted-foreground">Archivados (2)</div>
        </div>
      </div>
    </aside>
  </div>`;
}

const HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="./aside.css"></head>
<body>
${caso("despues", "despues")}
${caso("antes", "antes")}
</body></html>`;

async function compilarCss(directorio) {
  const entradaTailwind = join(dirname(require.resolve("tailwindcss/package.json")), "index.css");
  // La CSS real del proyecto: trae los tokens del tema y la utilidad
  // `scroll-fino`, sin la cual el carril medido no sería el de verdad.
  const globals = (await readFile(join(raizWeb, "src/app/globals.css"), "utf8"))
    .replace('@import "tw-animate-css";', "")
    .replace('@import "shadcn/tailwind.css";', "");
  const fuente = join(directorio, "index.html").replace(/\\/g, "/");
  const css = globals.replace(
    '@import "tailwindcss";',
    `@import "${entradaTailwind}" source(none);\n@source "${fuente}";`
  );
  const resultado = await postcss([tailwindcss()]).process(css, {
    from: join(directorio, "aside.css"),
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
  const card = caso.querySelector("[data-card]");
  const header = caso.querySelector("[data-header]");
  const region = caso.querySelector("[data-region]");
  const agregar = caso.querySelector("[data-agregar]");
  const alternar = caso.querySelector("[data-alternar]");
  const a = aside.getBoundingClientRect();
  const c = card.getBoundingClientRect();
  const scrollables = [caso, ...caso.querySelectorAll("*")].filter((el) => {
    const overflowY = getComputedStyle(el).overflowY;
    return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight - el.clientHeight > 1;
  }).length;
  return {
    id: caso.dataset.caso,
    variante: caso.dataset.variante,
    altoVentana: window.innerHeight,
    asideOverflowY: getComputedStyle(aside).overflowY,
    asideConScroll: aside.scrollHeight - aside.clientHeight > 1,
    cardTop: Math.round(c.top),
    cardBottom: Math.round(c.bottom),
    cardCabe: c.top >= a.top - 1 && c.bottom <= window.innerHeight + 1,
    cardOverflowX: card.scrollWidth - card.clientWidth,
    headerOverflowX: header.scrollWidth - header.clientWidth,
    regionOverflowX: region.scrollWidth - region.clientWidth,
    regionConScroll: region.scrollHeight - region.clientHeight > 1,
    carril: region.offsetWidth - region.clientWidth,
    scrollables,
    agregarAlto: agregar.offsetHeight,
    alternarAlto: alternar.offsetHeight,
    gutter: getComputedStyle(region).scrollbarGutter,
  };
}))()`;

// Con la lista al fondo, el pie de la tarjeta debe seguir dentro de la ventana.
const MEDICION_PIE = `(() => {
  document.querySelectorAll("[data-region]").forEach((r) => { r.scrollTop = r.scrollHeight; });
  return [...document.querySelectorAll("[data-caso]")].map((caso) => {
    const pie = caso.querySelector("[data-pie]");
    const ultimo = caso.querySelector("[data-ultimo]");
    const p = pie.getBoundingClientRect();
    const u = ultimo.getBoundingClientRect();
    const region = caso.querySelector("[data-region]");
    const rr = region.getBoundingClientRect();
    return {
      id: caso.dataset.caso,
      pieVisible: p.top >= -1 && p.bottom <= window.innerHeight + 1,
      ultimoEnRegion: u.top >= rr.top - 1 && u.bottom <= rr.bottom + 1,
    };
  });
})()`;

// Sticky: con un encabezado de grupo por encima del borde de la región,
// debe quedar pegado al borde superior de la región.
const MEDICION_STICKY = `(() => [...document.querySelectorAll("[data-caso]")].map((caso) => {
  const region = caso.querySelector("[data-region]");
  const header = caso.querySelector("[data-grupo]");
  const delta = header.getBoundingClientRect().top - region.getBoundingClientRect().top;
  region.scrollTop += delta + 20;
  const rr = region.getBoundingClientRect();
  const hr = header.getBoundingClientRect();
  return {
    id: caso.dataset.caso,
    pegado: Math.abs(hr.top - rr.top) <= 1,
    topHeader: Math.round(hr.top),
    topRegion: Math.round(rr.top),
  };
}))()`;

let fallos = 0;

function revisar(base, pie, sticky) {
  for (const m of base) {
    const resumen =
      `aside overflow-y ${m.asideOverflowY}, scroll propio ${m.asideConScroll}; ` +
      `tarjeta ${m.cardTop}–${m.cardBottom} en ventana ${m.altoVentana} (cabe ${m.cardCabe}); ` +
      `desborde-x tarjeta ${m.cardOverflowX}, encabezado ${m.headerOverflowX}, lista ${m.regionOverflowX}; ` +
      `lista con scroll ${m.regionConScroll}; contenedores con scroll ${m.scrollables}; ` +
      `Agregar ${m.agregarAlto}px, alternar ${m.alternarAlto}px; carril ${m.carril}px; gutter ${m.gutter}`;
    const delPie = pie.find((p) => p.id === m.id);
    const delSticky = sticky.find((s) => s.id === m.id);
    const haySticky = m.variante !== "antes";

    if (m.variante === "antes") {
      console.log(`  · antes:   ${resumen}`);
      const overflow = m.headerOverflowX > 0 || m.cardOverflowX > 0;
      if (!overflow && !m.asideConScroll) {
        fallos += 1;
        console.log("    ✗ el defecto (desborde del encabezado / scroll del aside) ya no se reproduce");
      }
      continue;
    }

    const problemas = [];
    if (m.asideConScroll) problemas.push("el aside scrollea (debe scrollear solo la lista)");
    if (m.asideOverflowY !== "visible") problemas.push(`el aside tiene overflow ${m.asideOverflowY}`);
    if (!m.cardCabe) problemas.push("la tarjeta no cabe en la ventana");
    if (m.scrollables !== 1)
      problemas.push(`hay ${m.scrollables} contenedores con scroll (debe haber 1: la lista)`);
    if (delPie && !delPie.pieVisible) problemas.push("el pie de la tarjeta no se alcanza");
    if (delPie && !delPie.ultimoEnRegion) problemas.push("el último renglón no se alcanza en la lista");
    if (m.cardOverflowX > 0) problemas.push(`la tarjeta desborda en horizontal (${m.cardOverflowX}px)`);
    if (m.headerOverflowX > 0) problemas.push(`el encabezado desborda en horizontal (${m.headerOverflowX}px)`);
    if (m.regionOverflowX > 0) problemas.push(`la lista desborda en horizontal (${m.regionOverflowX}px)`);
    if (m.agregarAlto < 44) problemas.push(`Agregar de ${m.agregarAlto}px (piso 44px)`);
    if (m.alternarAlto < 44) problemas.push(`alternar de ${m.alternarAlto}px (piso 44px)`);
    if (!/\bstable\b/.test(m.gutter)) problemas.push(`la lista no reserva el carril (gutter ${m.gutter})`);
    if (m.carril < 1 || m.carril > 8)
      problemas.push(`la barra no es fina: carril de ${m.carril}px (esperado ~6px)`);
    if (haySticky && delSticky && !delSticky.pegado)
      problemas.push(`el encabezado no se pega a la lista (top ${delSticky.topHeader} vs ${delSticky.topRegion})`);

    if (problemas.length > 0) {
      fallos += 1;
      console.log(`  ✗ después: ${resumen} → ${problemas.join("; ")}`);
    } else {
      console.log(`  ✓ después: ${resumen}`);
      if (delSticky) console.log(`      encabezado pegado a la lista (top ${delSticky.topHeader}).`);
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
    const { result: base } = await pedir(ws, 4, "Runtime.evaluate", {
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
    revisar(base.value, pie.value, sticky.value);
  } finally {
    proceso.kill("SIGKILL");
  }

  if (fallos > 0) {
    console.error(`\n${fallos} medición(es) fuera de contrato.`);
    process.exitCode = 1;
  } else {
    console.log(
      "\nContrato cumplido: el aside no scrollea, la tarjeta cabe entera con su pie, la lista scrollea sola y nada desborda en horizontal."
    );
  }
} finally {
  await rm(directorio, { recursive: true, force: true });
}
