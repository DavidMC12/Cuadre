/**
 * Medición real de la barra de pestañas del celular (app-shell.tsx).
 *
 * jsdom no calcula layout, así que las clases (`grow`, `min-w-[44px]`,
 * `truncate`) fijadas en app-shell.test.tsx garantizan el patrón pero no los
 * anchos. Este script mide de verdad: compila la CSS de Tailwind del proyecto
 * contra un espejo de la barra, la abre en Chromium headless por CDP a 320px
 * y comprueba, con la letra del sistema al 100%–200%, que:
 *
 *   1. la barra no desborda — medido en el contenedor flex de la barra y no
 *      en el documento: la barra es `position: fixed`, y el desborde de sus
 *      hijos no engorda el `scrollWidth` del documento (una barra de 8
 *      pestañas se saldría por la derecha con el documento en verde);
 *   2. ninguna pestaña baja de 44px — el piso del pulgar, en píxeles fijos
 *      (un objetivo de toque es una constante física del dedo, no un tamaño
 *      tipográfico; si fuera rem, cinco pisos dejarían de caber a 320px
 *      desde ~145% de escala y la última pestaña quedaría fuera);
 *   3. la barra mide 4rem de alto: escala con la letra, igual que el
 *      `pb-24` del contenido que deja el hueco para ella.
 *
 * Con cinco pestañas y letra al 100% los cinco rótulos se leen completos —
 * la garantía de la ronda anterior. Con letra grande o pestañas de más, lo
 * que se recorta con puntos suspensivos es el rótulo, nunca el objetivo.
 *
 * El techo del patrón, medido: siete pestañas caben a 320px (7 × 44 = 308px
 * de piso); ocho ya no. A la octava toca el patrón de menú con desborde, no
 * seguir encogiendo.
 *
 * Limitaciones, a sabiendas:
 * - El espejo replica las clases de app-shell.tsx a mano; si cambia la barra,
 *   actualizar el HTML de abajo (la prueba de app-shell.test.tsx fija las
 *   clases del componente real, y este script mide el espejo compilado).
 * - El espejo omite `pb-[env(safe-area-inset-bottom)]` (irrelevante en el
 *   Chromium de escritorio) y no importa `globals.css`, así que los tokens
 *   de color (`text-foreground`, `border-border`…) no resuelven: no afectan
 *   nada geométrico.
 * - La fuente del espejo es la del sistema de respaldo, más ancha que Geist:
 *   lo que aquí se mide es el peor caso, no el render exacto.
 * - Necesita `chromium` en el PATH y no corre dentro de vitest: es una
 *   verificación manual de diseño (como las de las rondas de critique), no
 *   una prueba del suite.
 *
 * Uso: npm run medir:nav  (dentro de web/)
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

/** El espejo de la barra: mismas clases que la barra inferior de app-shell.tsx,
 * con los cinco rótulos de verdad y variantes de seis y siete para el piso y
 * el techo del patrón. */
const ETIQUETAS_CINCO = ["Resumen", "Cuentas", "Movimientos", "Presupuesto", "Ajustes"];
const BARRAS = [
  { id: "cinco", etiquetas: ETIQUETAS_CINCO },
  { id: "seis", etiquetas: [...ETIQUETAS_CINCO, "Recordar"] },
  {
    id: "siete",
    etiquetas: [...ETIQUETAS_CINCO, "Recordar", "Categorías"],
  },
];

const clasesDePestana = (activa) =>
  `flex min-w-[44px] grow flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
    activa ? "text-foreground" : "text-muted-foreground hover:text-foreground"
  }`;

function barra({ id, etiquetas }) {
  return `
  <nav aria-label="Navegación principal" data-barra="${id}"
       class="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background md:hidden">
    <div class="mx-auto flex h-16 w-full max-w-md items-stretch">
      ${etiquetas
        .map(
          (etiqueta, indice) => `
        <a href="#" class="${clasesDePestana(indice === 0)}" aria-current="${indice === 0 ? "page" : "false"}">
          <svg viewBox="0 0 24 24" class="size-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>
          <span class="w-full truncate text-center">${etiqueta}</span>
        </a>`
        )
        .join("\n")}
    </div>
  </nav>`;
}

const HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="./nav.css">
</head>
<body>
${BARRAS.map(barra).join("\n")}
</body>
</html>`;

const CSS = `
@import "tailwindcss" source(none);
@source "./index.html";
`;

/** Compila la CSS con la misma versión de Tailwind que usa la app. */
async function compilarCss(directorio) {
  // La CSS vive en /tmp, donde no hay node_modules: la entrada de Tailwind se
  // importa por ruta absoluta, resuelta desde el proyecto.
  const entradaTailwind = join(dirname(require.resolve("tailwindcss/package.json")), "index.css");
  const resultado = await postcss([tailwindcss()]).process(
    CSS.replace("./index.html", join(directorio, "index.html")).replace(
      "tailwindcss",
      entradaTailwind
    ),
    { from: join(directorio, "nav.css") }
  );
  return resultado.css;
}

/** Chromium headless por CDP, sin dependencias: el WebSocket del protocolo
 * viene de fábrica en Node. */
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
          if (ws) resuelto(ws.replace("devtools/browser", "devtools/page"));
          else rechazado(new Error("No se encontró el endpoint de página de Chromium."));
        }
      });
      // Sin chromium instalado el aviso llega aquí, no por stderr: sin esto
      // el fallo es un ENOENT crudo y la limpieza no corre.
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
    // Nada de huérfanos: si algo falla después de arrancar el navegador, se
    // cierra antes de devolver el error.
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

const MEDICION = `(() => {
  const barras = [...document.querySelectorAll("[data-barra]")];
  const raiz = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return { raiz, barras: barras.map((barra) => {
    const fila = barra.querySelector("div");
    return {
      id: barra.dataset.barra,
      altura: fila.offsetHeight,
      // El desborde de una barra fixed no engorda el documento: se mira en
      // el contenedor flex, donde el scroll de sobra sí aparece.
      desborde: fila.scrollWidth > fila.clientWidth,
      anchoFila: fila.clientWidth,
      scrollFila: fila.scrollWidth,
      pestañas: [...barra.querySelectorAll("a")].map((a) => {
        const rótulo = a.querySelector("span");
        return {
          etiqueta: rótulo.textContent,
          ancho: a.offsetWidth,
          recortado: rótulo.scrollWidth > rótulo.clientWidth,
        };
      }),
    };
  }) };
})()`;

const ESCALAS = [100, 125, 150, 200];
let fallos = 0;

function revisar(escala, { raiz, barras: mediciones }) {
  // Lo que mide en rem escala con la letra del sistema: la altura (`h-16` =
  // 4rem, como el `pb-24` del contenido). El piso NO: 44px fijos.
  const alturaEsperada = Math.round(4 * raiz);

  for (const barra of mediciones) {
    const problemas = [];
    if (barra.desborde) {
      problemas.push(`la barra desborda (${barra.scrollFila}px de contenido en ${barra.anchoFila}px)`);
    }
    if (Math.abs(barra.altura - alturaEsperada) > 1) {
      problemas.push(`altura ${barra.altura}px, se esperaban ~${alturaEsperada}px (h-16 escalado)`);
    }
    for (const pestaña of barra.pestañas) {
      if (pestaña.ancho < 44) {
        problemas.push(`"${pestaña.etiqueta}" mide ${pestaña.ancho}px (piso 44px)`);
      }
    }
    if (problemas.length > 0) {
      fallos += 1;
      console.log(`  ✗ barra ${barra.id}: ${problemas.join("; ")}`);
    } else {
      const anchos = barra.pestañas.map((p) => `${p.etiqueta}=${p.ancho}px`).join(" ");
      const recortados = barra.pestañas.filter((p) => p.recortado).length;
      console.log(
        `  ✓ barra ${barra.id} (letra ${escala}%): ${anchos}; ${recortados} rótulo(s) recortado(s), objetivos ≥ 44px`
      );
      // La garantía de la ronda anterior: a 320px con la letra normal, los
      // cinco rótulos se leen completos — el piso no debe recortar de más.
      if (barra.id === "cinco" && escala === 100 && recortados > 0) {
        fallos += 1;
        console.log("    ✗ a 320px con letra al 100%, los cinco rótulos deberían verse completos");
      }
    }
  }
}

const directorio = await mkdtemp(join(tmpdir(), "nav-pestanas-"));
try {
  await writeFile(join(directorio, "index.html"), HTML);
  await writeFile(join(directorio, "nav.css"), await compilarCss(directorio));

  console.log("Chromium headless a 320px, letra del sistema del 100% al 200%:");
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
      width: 320,
      height: 640,
      deviceScaleFactor: 1,
      mobile: true,
    });

    for (const escala of ESCALAS) {
      await pedir(ws, 4, "Runtime.evaluate", {
        expression: `document.documentElement.style.fontSize = "${escala}%"`,
      });
      const { result } = await pedir(ws, 5, "Runtime.evaluate", {
        expression: MEDICION,
        returnByValue: true,
      });
      revisar(escala, result.value);
    }
  } finally {
    proceso.kill("SIGKILL");
  }

  if (fallos > 0) {
    console.error(`\n${fallos} medición(es) fuera de contrato.`);
    process.exitCode = 1;
  } else {
    console.log("\nTodas las mediciones dentro del contrato: sin desborde, piso de 44px, altura que escala.");
  }
} finally {
  await rm(directorio, { recursive: true, force: true });
}
