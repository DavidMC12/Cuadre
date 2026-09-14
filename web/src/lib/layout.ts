/**
 * Ancho del contenido, por tramos de pantalla.
 *
 * En el celular llena la pantalla. En escritorio crece, pero con tope: una
 * lista de movimientos estirada a 1200 píxeles se lee peor que una angosta,
 * porque el ojo pierde la fila al cruzar de la descripción al monto.
 *
 * Vive en un solo lugar porque el aviso de suplantación tiene que alinearse
 * exactamente con el contenido que tiene debajo.
 */
export const ANCHO_CONTENIDO = "max-w-md md:max-w-2xl lg:max-w-3xl";

/**
 * La misma frontera del tramo `lg` de Tailwind (1024px), pero para decidir en
 * JavaScript lo que una clase no puede: qué componente se monta. Si el tramo
 * cambia en la configuración de Tailwind, hay que cambiarlo aquí también.
 */
export const CONSULTA_TRAMO_LG = "(min-width: 64rem)";
