/**
 * Clases del aside del Resumen y de la lista de presupuesto que vive dentro.
 *
 * Viven en un módulo compartido para que el componente (`page.tsx`,
 * `cuanto-me-sobra.tsx`, `panel-presupuesto.tsx`) y el script de medición
 * (`scripts/medir-aside-resumen.mjs`) usen EXACTAMENTE las mismas cadenas: si
 * alguien quita un `shrink-0`, la medición lo ve en vez de medir un espejo
 * que se quedó atrás.
 *
 * El aside tiene tope de alto (`100vh - 2rem`) y scroll propio: es el ÚNICO
 * scroll de la columna. Sus hijos directos son las tarjetas de "cuánto me
 * sobra" y del presupuesto.
 */
export const CLASES_ASIDE =
  "flex w-80 shrink-0 flex-col gap-5 xl:sticky xl:top-8 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto";

/**
 * Cada tarjeta hija del aside. Sin esto el flex las encogía: la Card trae
 * `overflow-hidden`, así que su `min-height: auto` cae a 0 y en vez de
 * desbordar el aside se aplastaba la tarjeta y se recortaba su contenido.
 * `shrink-0` la deja crecer con su contenido; `min-h-fit` lo refuerza.
 */
export const CLASES_BLOQUE_ASIDE = "shrink-0 min-h-fit";

/** Reservado para ajustes de la tarjeta del panel dentro del aside. En el
 * aside la tarjeta cede su `overflow-hidden` para que el encabezado `sticky`
 * de cada grupo se pegue al scroll del aside y no a una Card que no scrollea. */
export const CLASES_CARD_PANEL_ASIDE = "overflow-visible";

/**
 * La región de la lista del panel: siempre enfocable, con `pr-1`. Sin
 * `overflow-y-auto` propio: con tope scrollea con el tope, y sin tope deja
 * que scrollee su contenedor (el aside o el cajón). Así hay un solo scroll.
 */
export const CLASES_REGION_PANEL =
  "flex flex-col pr-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85";

/** El tope propio de la región, solo cuando ningún contenedor ya scrollea. */
export const CLASES_REGION_PANEL_CON_TOPE = "max-h-[70vh] overflow-y-auto";

/**
 * El encabezado tocable de cada grupo de categoría. Queda pegado arriba
 * (`sticky top-0`) mientras se recorren sus ítems dentro del scroll del
 * contenedor, con fondo de tarjeta para tapar los renglones que pasan por
 * debajo y `z-10` para pintar por encima de ellos.
 */
export const CLASES_ENCABEZADO_GRUPO =
  "sticky top-0 z-10 flex min-h-11 w-full items-center gap-2 rounded-lg bg-card px-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85";
