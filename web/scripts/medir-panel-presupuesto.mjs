/**
 * Medición real del panel de presupuesto agrupado (panel-presupuesto.tsx).
 *
 * jsdom no calcula layout: las pruebas fijan las clases (truncate, min-h-11,
 * overflow-y-auto) pero no los anchos. Este script compila la CSS de Tailwind
 * del proyecto contra un espejo de la lista, la abre en Chromium headless por
 * CDP a 320px (cajón móvil) y 1280px (columna del Resumen) y comprueba lo que
 * el review no podía ver:
 *
 *   1. la región de scroll NO desborda en horizontal. `overflow-y: auto` con
 *      el eje X en `visible` lo vuelve `auto`; un renglón con `-mx-2` (margen
 *      negativo) se salía 8px de cada lado y generaba scroll horizontal y
 *      recorte del borde/fondo de hover;
 *   2. el texto del renglón queda alineado con el título del grupo (antes el
 *      `-mx-2` corría el renglón 8px a la izquierda del encabezado);
 *   3. el encabezado del grupo mide al menos 44px de alto (piso del pulgar).
 *
 * Se mide dos variantes: "antes" (el `-mx-2` que había) y "despues" (el
 * arreglo). Solo "despues" entra en el contrato; "antes" se imprime como
 * evidencia de que el defecto existía.
 *
 * Limitaciones, a sabiendas:
 * - El espejo replica las clases a mano; si cambia la lista, actualizar el
 *   HTML de abajo (las pruebas de panel-presupuesto.test.tsx fijan las clases
 *   del componente real y este script mide el espejo compilado).
 * - La fuente es la del sistema de respaldo, más ancha que Geist: peor caso.
 * - Necesita `chromium` en el PATH y no corre dentro de vitest: verificación
 *   manual de diseño.  Uso: `node scripts/medir-panel-presupuesto.mjs`.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

import { CLASES_ENCABEZADO_SECCION, CLASES_TITULO_SECCION } from "../src/lib/aside-resumen.ts";

const raizWeb = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(raizWeb, "package.json"));
const postcss = require("postcss");
const tailwindcss = require("@tailwindcss/postcss");

const CLASES_REGION =
  "scroll-fino flex flex-col overflow-y-auto pr-1 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85";
const CLASES_HEADER =
  "flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent/50";

/** Un renglón del checklist, con o sin el `-mx-2` del defecto. */
function fila(conMargenNegativo) {
  return `
  <li data-fila class="${conMargenNegativo ? "-mx-2 " : ""}rounded-lg hover:bg-accent/50">
    <button class="flex w-full cursor-pointer flex-col gap-1.5 px-2 py-3 text-left outline-none">
      <div class="flex items-center justify-between gap-3">
        <span data-fila-texto class="truncate text-sm font-medium">Mercado del mes</span>
      </div>
      <div role="progressbar" class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div class="h-full rounded-full bg-foreground/60" style="width:60%"></div>
      </div>
      <p class="text-xs text-muted-foreground"><span class="font-mono tabular-nums">$20.500</span> de <span class="font-mono tabular-nums">$30.000</span></p>
    </button>
  </li>`;
}

/**
 * La fila "Sin asignar: $X" del grupo, ya convertida en botón de 44px con su
 * "Asignar" discreto. Se mide junto al resto: a 320px no puede desbordar ni
 * bajar del piso del pulgar. Las clases son las del componente real
 * (asignar-sin-asignar.tsx).
 */
function filaSinAsignar() {
  return `
  <li data-sin-asignar class="border-t border-border">
    <button class="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs text-muted-foreground outline-none transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85">
      <span class="min-w-0 truncate">Sin asignar: <span class="font-mono tabular-nums">$267.530</span></span>
      <span class="shrink-0 font-medium text-foreground">Asignar</span>
    </button>
  </li>`;
}

function grupo(titulo, conMargenNegativo) {
  return `
  <section>
    <button data-header class="${CLASES_HEADER}">
      <span aria-hidden class="size-2.5 shrink-0 rounded-full" style="background-color:#2a78d6"></span>
      <span data-titulo class="min-w-0 flex-1 truncate">${titulo}</span>
      <span class="tabular-nums">2</span>
      <svg aria-hidden class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <ul class="flex flex-col">${fila(conMargenNegativo)}${fila(conMargenNegativo)}${filaSinAsignar()}</ul>
  </section>`;
}

/** El encabezado de una sección con su total a la derecha, como el componente
 * real (mismas clases compartidas). El rótulo y la cifra van largos a
 * propósito: así la medición sí distingue el reparto rótulo/total (el rótulo
 * recorta, el total no) de un desborde real a 320px. */
function seccion(titulo, total) {
  return `
  <div data-seccion class="${CLASES_ENCABEZADO_SECCION}">
    <h3 class="${CLASES_TITULO_SECCION}">${titulo}</h3>
    <span data-total class="shrink-0 whitespace-nowrap" role="img" aria-label="Total de ${titulo.toLowerCase()} previstos: ${total}"><span class="font-mono tabular-nums text-xs font-medium text-muted-foreground">${total}</span></span>
  </div>`;
}

function panel(conMargenNegativo, conTope = true) {
  return `<div data-region role="region" aria-label="Ítems del presupuesto" tabindex="0" class="${CLASES_REGION}${conTope ? " max-h-[70vh]" : ""}">
    ${seccion("Gastos operativos del hogar", "$1.234.567.890.123")}
    ${grupo("Comida", conMargenNegativo)}
    ${grupo("Transporte", conMargenNegativo)}
    ${grupo("Ocio", conMargenNegativo)}
  </div>`;
}

/** Un caso = viewport + contenedor real (cajón móvil / columna del Resumen). */
function caso(id, variante, motivo, envoltorio, ancho) {
  return `<div data-caso="${id}" data-variante="${variante}" data-motivo="${motivo}" data-ancho="${ancho}">${envoltorio(
    panel(variante === "antes", !id.startsWith("cajon") || variante === "antes")
  )}</div>`;
}

const HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="./panel.css"></head>
<body>
${caso(
  "movil-antes",
  "antes",
  "overflow",
  (p) => `<div class="w-full overflow-y-auto px-4 pb-4">${p}</div>`,
  320
)}
${caso(
  "movil-despues",
  "despues",
  "overflow",
  (p) => `<div class="w-full overflow-y-auto px-4 pb-4">${p}</div>`,
  320
)}
${caso(
  "escritorio-antes",
  "antes",
  "overflow",
  (p) => `<aside class="w-80"><div class="rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">${p}</div></aside>`,
  1280
)}
${caso(
  "escritorio-despues",
  "despues",
  "overflow",
  (p) => `<aside class="w-80"><div class="rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">${p}</div></aside>`,
  1280
)}
${caso(
  "cajon-antes",
  "antes",
  "cajon",
  // El cajón real: popup en columna, cabeza fija, un Content que recorta y el
  // cuerpo `overflow-y-auto` tal cual está en page.tsx (sin `flex-1`). Debajo de
  // la región va lo que queda fuera de ella (Agregar/archivados): eso es lo que
  // hace que el contenedor también scrollee además de la región.
  (p) => `<div class="flex h-[480px] flex-col"><div class="h-20 shrink-0"></div><div class="flex min-h-0 flex-1 flex-col overflow-hidden"><div class="overflow-y-auto px-4 pb-4">${p}<div class="mt-3 h-[120px] rounded-lg border border-border"></div></div></div></div>`,
  320
)}
${caso(
  "cajon-despues",
  "despues",
  "cajon",
  (p) => `<div class="flex h-[480px] flex-col"><div class="h-20 shrink-0"></div><div class="flex min-h-0 flex-1 flex-col overflow-hidden"><div class="overflow-y-auto px-4 pb-4">${p}<div class="mt-3 h-[120px] rounded-lg border border-border"></div></div></div></div>`,
  320
)}
</body></html>`;

async function compilarCss(directorio) {
  const entradaTailwind = join(dirname(require.resolve("tailwindcss/package.json")), "index.css");
  // La CSS real del proyecto para que la utilidad `scroll-fino` (y sus tokens)
  // entren en la medición; se le inyecta el `@source` del espejo.
  const globals = (await readFile(join(raizWeb, "src/app/globals.css"), "utf8"))
    .replace('@import "tw-animate-css";', "")
    .replace('@import "shadcn/tailwind.css";', "");
  const fuente = join(directorio, "index.html").replace(/\\/g, "/");
  const css = globals.replace(
    '@import "tailwindcss";',
    `@import "${entradaTailwind}" source(none);\n@source "${fuente}";`
  );
  const resultado = await postcss([tailwindcss()]).process(css, {
    from: join(directorio, "panel.css"),
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
  const region = caso.querySelector("[data-region]");
  const header = caso.querySelector("[data-header]");
  const titulo = caso.querySelector("[data-titulo]");
  const filaTexto = caso.querySelector("[data-fila-texto]");
  const filaLi = caso.querySelector("[data-fila]");
  const sinAsignar = caso.querySelector("[data-sin-asignar] button");
  const seccion = caso.querySelector("[data-seccion]");
  const total = caso.querySelector("[data-total]");
  // Cuántos contenedores dentro del caso tienen scroll vertical propio: con
  // dos o más hay scroll anidado.
  const scrollables = [caso, ...caso.querySelectorAll("*")].filter(
    (el) => el.scrollHeight - el.clientHeight > 1
  ).length;
  return {
    id: caso.dataset.caso,
    variante: caso.dataset.variante,
    motivo: caso.dataset.motivo,
    ancho: Number(caso.dataset.ancho),
    desbordeX: region.scrollWidth - region.clientWidth,
    desbordeY: region.scrollHeight - region.clientHeight,
    // El encabezado de sección (con su total) no debe desbordar ni recortar
    // la cifra: el rótulo cede, el total no.
    seccionOverflowX: seccion.scrollWidth - seccion.clientWidth,
    totalOverflowX: total.scrollWidth - total.clientWidth,
    // El encabezado debe quedar en UNA línea: si el rótulo envolviera en vez de
    // recortar, el alto se dispara.
    seccionAlto: seccion.offsetHeight,
    seccionTituloAlto: seccion.querySelector("h3").offsetHeight,
    scrollables,
    headerAlto: header.offsetHeight,
    // La fila "Sin asignar" ahora es un botón: piso de 44px y sin desborde.
    sinAsignarAlto: sinAsignar.offsetHeight,
    sinAsignarOverflowX: sinAsignar.scrollWidth - sinAsignar.clientWidth,
    // Cuánto se corre la caja del renglón respecto de la del encabezado: es lo
    // que el margen negativo descuadraba (el texto se movía 8px a la izquierda).
    desalineacion: Math.round((filaLi.getBoundingClientRect().left - header.getBoundingClientRect().left) * 100) / 100,
    // Extra: el texto del renglón debía quedar bajo el título, salvando el
    // ancho del punto de color (10px + 8px de gap).
    sangriaTitulo: Math.round((titulo.getBoundingClientRect().left - filaTexto.getBoundingClientRect().left) * 100) / 100,
  };
}))()`;

let fallos = 0;

const ANCHOS = [
  { ancho: 320, etiqueta: "320px (cajón móvil)" },
  { ancho: 1280, etiqueta: "1280px (columna del Resumen)" },
];

function revisar(mediciones) {
  for (const ancho of ANCHOS) {
    console.log(`\n${ancho.etiqueta}:`);
    for (const m of mediciones.filter((x) => x.ancho === ancho.ancho)) {
      const resumen =
        `desborde-x ${m.desbordeX}px; caja del renglón vs encabezado ${m.desalineacion}px; ` +
        `sangría del título ${m.sangriaTitulo}px; alto de encabezado ${m.headerAlto}px; ` +
        `fila Sin asignar ${m.sinAsignarAlto}px, desborde ${m.sinAsignarOverflowX}px; ` +
        `sección ${m.seccionOverflowX}px, total ${m.totalOverflowX}px, alto ${m.seccionAlto}px (título ${m.seccionTituloAlto}px); ` +
        `scroll ${m.scrollables}; desborde-y ${m.desbordeY}px`;
      if (m.variante === "antes") {
        console.log(`  · antes:   ${resumen}`);
        // Si el defecto deja de reproducirse, la comparación no prueba nada:
        // el espejo habría dejado de ser fiel.
        if (m.motivo === "overflow" && m.desbordeX <= 0) {
          fallos += 1;
          console.log("    ✗ el desborde horizontal ya no se reproduce");
        }
        if (m.motivo === "cajon" && m.scrollables < 2) {
          fallos += 1;
          console.log("    ✗ el scroll anidado ya no se reproduce");
        }
        continue;
      }
      const problemas = [];
      if (m.desbordeX > 0) problemas.push(`desborda en horizontal (${m.desbordeX}px)`);
      if (m.seccionOverflowX > 0)
        problemas.push(`el encabezado de sección desborda (${m.seccionOverflowX}px)`);
      if (m.totalOverflowX > 0)
        problemas.push(`el total de la sección se recorta (${m.totalOverflowX}px)`);
      if (m.seccionTituloAlto > 24)
        problemas.push(`el rótulo de sección ocupa ${m.seccionTituloAlto}px (debe ser una línea)`);
      if (Math.abs(m.desalineacion) > 0.5)
        problemas.push(`renglón descuadrado con el encabezado (${m.desalineacion}px)`);
      if (m.headerAlto < 44) problemas.push(`encabezado de ${m.headerAlto}px (piso 44px)`);
      if (m.sinAsignarAlto < 44)
        problemas.push(`fila Sin asignar de ${m.sinAsignarAlto}px (piso 44px)`);
      if (m.sinAsignarOverflowX > 0)
        problemas.push(`la fila Sin asignar desborda (${m.sinAsignarOverflowX}px)`);
      if (m.motivo === "cajon" && m.scrollables !== 1)
        problemas.push(`scroll anidado: ${m.scrollables} contenedores scrollean`);
      if (problemas.length > 0) {
        fallos += 1;
        console.log(`  ✗ después: ${resumen} → ${problemas.join("; ")}`);
      } else {
        console.log(`  ✓ después: ${resumen}`);
      }
    }
  }
}

const directorio = await mkdtemp(join(tmpdir(), "panel-presupuesto-"));
try {
  await writeFile(join(directorio, "index.html"), HTML);
  await writeFile(join(directorio, "panel.css"), await compilarCss(directorio));

  console.log("Chromium headless: lista del presupuesto en cajón móvil y columna del Resumen.");
  const { proceso, ws } = await abrirChromium();
  try {
    await new Promise((resuelto, rechazado) => {
      ws.addEventListener("open", resuelto, { once: true });
      ws.addEventListener("error", () => rechazado(new Error("No se pudo abrir el canal CDP.")));
    });
    await pedir(ws, 1, "Page.enable");
    await pedir(ws, 2, "Page.navigate", { url: `file://${join(directorio, "index.html")}` });
    await esperarEvento(ws, "Page.loadEventFired");

    // Dos anchos de verdad: a 320px el cajón móvil llena el viewport; a 1280px
    // se mide la columna fija del Resumen (w-80).
    const mediciones = [];
    const viewports = [
      { ancho: 320, id: 3 },
      { ancho: 1280, id: 5 },
    ];
    for (const { ancho, id } of viewports) {
      await pedir(ws, id, "Emulation.setDeviceMetricsOverride", {
        width: ancho,
        height: 480,
        deviceScaleFactor: 1,
        mobile: ancho === 320,
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
    console.log("\nContrato cumplido en los dos anchos: sin scroll horizontal y renglones alineados.");
  }
} finally {
  await rm(directorio, { recursive: true, force: true });
}
