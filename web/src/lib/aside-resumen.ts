/**
 * Clases del aside del Resumen y de la lista de presupuesto que vive dentro.
 *
 * Viven en un módulo compartido para que el componente (`page.tsx`,
 * `cuanto-me-sobra.tsx`, `panel-presupuesto.tsx`) y el script de medición
 * (`scripts/medir-aside-resumen.mjs`) usen EXACTAMENTE las mismas cadenas: si
 * alguien quita un `shrink-0`, la medición lo ve en vez de medir un espejo
 * que se quedó atrás.
 *
 * El aside NO scrollea: solo la lista del presupuesto lo hace, dentro de su
 * tarjeta. La tarjeta se ajusta a la ventana para que el pie quede a la vista
 * sin que la página tenga que scrollear. Sus hijos directos no se encogen.
 */
export const CLASES_ASIDE = "flex w-80 shrink-0 flex-col gap-5 xl:sticky xl:top-8";

/**
 * Cada tarjeta hija del aside. `shrink-0` evita que el flex la aplaste. Ya no
 * lleva `min-h-fit`: con el tope de ventana de la tarjeta del panel, un
 * mínimo basado en el contenido ganaría al tope y el scroll interno no
 * llegaría a activarse.
 */
export const CLASES_BLOQUE_ASIDE = "shrink-0";

/**
 * La tarjeta del panel dentro del aside: se ajusta a la ventana (el alto que
 * sobra tras la cabecera y los márgenes). Su lista toma el espacio libre y
 * scrollea; la tarjeta mantiene su borde y su radio completos porque el scroll
 * vive adentro, no en la columna.
 */
export const CLASES_CARD_PANEL_VENTANA = "max-h-[calc(100vh-2rem)]";

/**
 * La región de la lista del panel: enfocable, con `pr-1` y la barra fina. Por
 * sí sola no scrollea; se le suma el tope o el ajuste a ventana.
 */
export const CLASES_REGION_PANEL =
  "scroll-fino flex flex-col pr-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85";

/** El tope propio de la región (pantalla de Presupuesto): alto fijo y scroll,
 * con el carril de la barra reservado para que el contenido no cambie de
 * ancho. */
export const CLASES_REGION_PANEL_CON_TOPE =
  "max-h-[70vh] overflow-y-auto [scrollbar-gutter:stable]";

/** La región del panel del aside: toma el alto que deja la tarjeta, scrollea
 * solo ella y reserva el carril de la barra. */
export const CLASES_REGION_PANEL_VENTANA =
  "min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]";

/**
 * El encabezado tocable de cada grupo de categoría. Es la base para cualquier
 * variante; el pegado al scroll se agrega aparte.
 */
export const CLASES_ENCABEZADO_GRUPO =
  "flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85";

/**
 * La fila del encabezado de cada sección del panel (Ingresos / Gastos): el
 * rótulo a la izquierda y su total del mes a la derecha, en la misma línea.
 * El total pesa más que el rótulo: si los dos no caben, el rótulo recorta
 * (`min-w-0` en el título, `shrink-0` en el total) y el total nunca se pierde.
 */
export const CLASES_ENCABEZADO_SECCION = "flex items-center justify-between gap-2 px-2 pt-3 pb-1";

/**
 * El rótulo de una sección. `min-w-0 truncate` es la mitad del reparto: cede
 * su ancho ante el total, que jamás se recorta.
 */
export const CLASES_TITULO_SECCION =
  "min-w-0 truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase";

/**
 * Extra cuando el panel vive en la tarjeta del aside: el encabezado se pega
 * arriba (`sticky top-0`) mientras se recorren sus ítems dentro del scroll de
 * la lista, con fondo de tarjeta (solo ahí la superficie es `bg-card`) para
 * tapar los renglones que pasan por debajo, `z-10` para pintar por encima y un
 * hover opaco para que no se transparenten mientras se pasa el cursor.
 */
export const CLASES_ENCABEZADO_GRUPO_FIJO = "sticky top-0 z-10 bg-card hover:bg-accent";
