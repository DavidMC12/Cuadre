import { esCero } from "@/lib/money";

/**
 * Colores para las gráficas del dashboard.
 *
 * La paleta categórica de 8 tonos está validada para que colores vecinos se
 * distingan incluso con daltonismo (orden fijo, nunca se generan tonos
 * nuevos). El color de cada categoría se asigna por su posición en el
 * catálogo completo del usuario (ordenado alfabetically por el propio
 * backend), no por su puesto en el reporte del mes — así una categoría no
 * cambia de color de un mes a otro solo porque ese mes gastó más o menos.
 * El catálogo llega ordenado alfabéticamente por el backend.
 */

const PALETA_CATEGORICA_CLARO = [
  "#2a78d6", // 1 azul
  "#eb6834", // 2 naranja
  "#1baf7a", // 3 aqua
  "#eda100", // 4 amarillo
  "#e87ba4", // 5 magenta
  "#008300", // 6 verde
  "#4a3aa7", // 7 violeta
  "#e34948", // 8 rojo
] as const;

const PALETA_CATEGORICA_OSCURO = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
] as const;

/** Gris neutro para "Sin categoría" y para lo que no cabe en la paleta. */
export const COLOR_NEUTRO = { claro: "#898781", oscuro: "#898781" } as const;

/** Ingreso/gasto son un par fijo, no una identidad categórica: reutiliza los
 * mismos colores que ya usa el componente `Monto` en el resto de la app.
 * El gasto va en tinta normal, no en rojo: gastar es un renglón del libro,
 * no una alarma. El rojo queda libre para lo que de verdad es un error. */
export const COLOR_INGRESO = { claro: "#059669", oscuro: "#34d399" } as const;
export const COLOR_GASTO = { claro: "#171717", oscuro: "#fafafa" } as const;

/**
 * El color de una barra según el signo de su monto, con el mismo criterio que
 * el componente `Monto`: verde si suma, tinta normal si resta, gris si es
 * cero. Un ahorro que se sacó no es una alarma: por eso el negativo no va en
 * rojo, igual que un gasto.
 */
export function colorPorSigno(monto: string, modo: ModoColor): string {
  if (esCero(monto)) return COLOR_NEUTRO[modo];
  return monto.trim().startsWith("-") ? COLOR_GASTO[modo] : COLOR_INGRESO[modo];
}

export type ModoColor = "claro" | "oscuro";

/**
 * Traduce el tema ya resuelto por `next-themes` al modo de esta paleta.
 *
 * Se usa `resolvedTheme` y no `theme` porque este último puede valer
 * `"system"`, que no dice si en verdad se está viendo claro u oscuro.
 * Mientras el navegador no ha tomado el control, `resolvedTheme` es
 * `undefined` (el tema vive en el aparato y el servidor no lo conoce): en ese
 * instante se asume "claro", que es como se veía antes de atar el color al tema.
 */
export function modoDeTema(resolvedTheme: string | undefined): ModoColor {
  return resolvedTheme === "dark" ? "oscuro" : "claro";
}

/**
 * Construye un mapa `categoryId -> color`, estable mientras no cambie el
 * catálogo. Recibe el catálogo completo (no el del reporte) ya ordenado por
 * nombre. Los primeros 8 se reparten la paleta; el resto comparte el gris
 * neutro en vez de inventar un tono nuevo.
 */
export function mapaColoresCategorias(
  categoriasOrdenadas: { id: string }[],
  modo: ModoColor = "claro"
): Map<string, string> {
  const paleta = modo === "claro" ? PALETA_CATEGORICA_CLARO : PALETA_CATEGORICA_OSCURO;
  const mapa = new Map<string, string>();
  categoriasOrdenadas.forEach((categoria, indice) => {
    mapa.set(categoria.id, indice < paleta.length ? paleta[indice] : COLOR_NEUTRO[modo]);
  });
  return mapa;
}
