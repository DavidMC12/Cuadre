/**
 * Clases y palabras de las dos tarjetas de totales del Resumen
 * ("Tienes" y "Ahorrado"), y de sus esqueletos.
 *
 * Viven en un módulo compartido para que los componentes
 * (`total-cuentas.tsx`, `total-ahorrado.tsx`) y el script de medición
 * (`scripts/medir-totales-resumen.mjs`) usen EXACTAMENTE las mismas cadenas:
 * las tarjetas y su esqueleto comparten estructura por construcción, y la
 * medición no mide un espejo que se quedó atrás. Ronda 11 de critique: el
 * esqueleto medía bloques fijos (74px / h-28) y la tarjeta real —con la
 * etiqueta partida en dos renglones y el renglón de deuda— salía más alta:
 * la página saltaba al cargar.
 *
 * La técnica del esqueleto: cada renglón de TEXTO (etiqueta, deuda, frase) es
 * un pulsante que lleva el texto REAL con `text-transparent` — la misma clase
 * de tipografía y el mismo contenido que la tarjeta —, así su alto (una o dos
 * líneas, según el ancho y el nombre del mes) es el de la tarjeta en cualquier
 * viewport. El renglón del MONTO es una barra `h-8`: `text-2xl` impone un
 * line-height de 2rem, una línea siempre.
 */
import { etiquetaMes } from "@/lib/fecha";

/**
 * El Card de ui/card.tsx tal como envuelve estas tarjetas (sin las variantes
 * de `data-size`, que no se usan aquí): `py-(--card-spacing)` con
 * `--card-spacing: --spacing(4)` es el mismo alto de 16px por lado que py-4,
 * que es como lo replica el script de medición (no puede renderizar React).
 * Lo comparte el ESPEJO, no los componentes: Card ya trae sus clases.
 */
export const CLASES_CARD_TOTALES =
  "flex flex-col overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10";

/**
 * La columna única de renglones dentro de la tarjeta. Los componentes la
 * pasan como className de CardContent (que ya agrega su padding horizontal
 * `px-(--card-spacing)`, también 16px — el espejo lo replica como px-4).
 */
export const CLASES_CONTENIDO_TOTALES = "flex flex-col gap-0.5";

/** La etiqueta en mayúsculas de la tarjeta ("Tienes", "Ahorrado", ...). */
export const CLASES_ETIQUETA_TOTALES =
  "text-xs text-muted-foreground uppercase tracking-wide";

/** El renglón en palabras de la deuda de tarjetas ("Debías en tarjetas: ..."). */
export const CLASES_DEUDA_TOTALES = "text-xs text-muted-foreground";

/**
 * El renglón bajo el monto de "Ahorrado" que explica lo que apartaste. La
 * tarjeta lo repite también en un mes pasado: explica la cifra que se ve.
 */
export const FRASE_AHORRADO = "Lo que apartaste, no el saldo de tus cuentas.";

/** Renglones de texto: `text-xs`, una línea como la de la tarjeta. */
export const CLASES_FRASE_AHORRADO = "text-xs text-muted-foreground";

/** El botón de "Registrar ahorro": existe solo en el mes en curso. */
export const CLASES_BOTON_AHORRADO = "mt-2 min-h-11 self-start";

/** Los renglones de TEXTO parten con `text-transparent` y quedan invisibles. */
export const CLASES_TEXTO_ESQUELETO = "text-transparent";

/**
 * La etiqueta de "Tienes"/"Tenías": con `mesDeCierre` cambia el tiempo verbal
 * al cierre del mes que se mira. La usan la tarjeta Y su esqueleto, para que
 * el texto invisible del esqueleto sea exactamente el que llegará a verse.
 */
export function etiquetaCuentas(mesDeCierre?: string): string {
  return mesDeCierre
    ? `Tenías al cierre de ${etiquetaMes(mesDeCierre)}`
    : "Tienes";
}

/** La etiqueta de "Ahorrado"/"Ahorrado al cierre de...". */
export function etiquetaAhorrado(mesDeCierre?: string): string {
  return mesDeCierre
    ? `Ahorrado al cierre de ${etiquetaMes(mesDeCierre)}`
    : "Ahorrado";
}

/** El renglón de la deuda de tarjetas, con su tiempo verbal. */
export function etiquetaDeudaTarjetas(mesDeCierre?: string): string {
  return mesDeCierre ? "Debías en tarjetas:" : "Debes en tarjetas:";
}
