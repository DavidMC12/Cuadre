/**
 * Armado de archivos CSV. Funciones puras: no saben de dinero ni de la base.
 *
 * Formato RFC 4180 —coma, comillas dobles, fin de línea CRLF— más el BOM de
 * UTF-8 al inicio, que es lo que hace que Excel en Windows muestre las tildes y
 * las eñes en vez de garabatos.
 *
 * Los montos NO se reformatean para que se vean bonitos en Excel: salen con el
 * punto decimal, exactamente como los guarda la base. Un respaldo que reescribe
 * las cifras deja de ser un respaldo.
 */

/** Windows lo espera al inicio del archivo para leerlo como UTF-8. */
const BOM = '﻿';

const FIN_DE_LINEA = '\r\n';

/**
 * Un campo solo se envuelve en comillas si lo necesita. Envolver todo sería más
 * simple, pero llenaría de comillas un archivo que alguien va a leer a ojo.
 *
 * No se hace nada contra las fórmulas de Excel (un campo que empieza en `=`).
 * Alterar el texto de un respaldo para protegerlo de sí mismo lo dañaría, y
 * aquí quien escribió las descripciones es la misma persona que abre el
 * archivo. Cuando la app tenga usuarios que compartan datos, hay que volver
 * sobre esto.
 */
export function escaparCampo(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return '';

  const texto = String(valor);
  if (!/[",\r\n]/.test(texto)) return texto;

  return `"${texto.replaceAll('"', '""')}"`;
}

/**
 * Un archivo sin filas sale igual con sus encabezados: así quien lo abre ve que
 * la exportación funcionó y que simplemente no hay nada todavía, en vez de un
 * archivo vacío que parece un error.
 */
export function armarCsv(
  encabezados: readonly string[],
  filas: readonly (string | null)[][],
): string {
  const lineas = [encabezados, ...filas].map((fila) => fila.map(escaparCampo).join(','));

  return BOM + lineas.join(FIN_DE_LINEA) + FIN_DE_LINEA;
}
