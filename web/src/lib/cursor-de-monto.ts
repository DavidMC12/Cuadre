/**
 * Dónde debe quedar el cursor de un campo de monto después de reformatear,
 * contando dígitos en vez de posiciones de texto — así insertar o borrar un
 * dígito en medio de un monto ya escrito no desordena los demás.
 *
 * Solo tiene sentido mientras se ESCRIBE: el texto de entrada y el de salida
 * son, salvo un carácter, el mismo, así que "dígitos antes del cursor" es una
 * medida estable entre los dos. Al PEGAR no se usa —el texto pegado puede
 * cambiar de forma completa, y ahí el lugar donde el navegador ya dejó el
 * cursor (justo después de lo pegado) ya es el correcto.
 */

/** Cuántos caracteres "significativos" (dígitos y coma decimal) hay antes de una posición. */
export function contarSignificativos(texto: string, hasta: number): number {
  let cuenta = 0;
  for (let i = 0; i < hasta && i < texto.length; i += 1) {
    if (/[\d,]/.test(texto[i]!)) cuenta += 1;
  }
  return cuenta;
}

/** La posición, en un texto ya formateado, justo después del n-ésimo carácter significativo. */
export function posicionParaSignificativos(texto: string, n: number): number {
  if (n <= 0) return 0;
  let cuenta = 0;
  for (let i = 0; i < texto.length; i += 1) {
    if (/[\d,]/.test(texto[i]!)) {
      cuenta += 1;
      if (cuenta === n) return i + 1;
    }
  }
  return texto.length;
}
