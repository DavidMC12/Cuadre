export interface DiferenciaDeTexto {
  prefijoComun: number;
  sufijoComun: number;
  /** Cuántos caracteres nuevos hay entre el prefijo y el sufijo comunes. */
  insertado: number;
}

/**
 * Compara dos textos por prefijo y sufijo comunes, para saber cuánto cambió
 * realmente entre uno y otro — sin importar si el cambio fue una tecla, un
 * borrado, o reemplazar todo de una vez.
 */
export function diferenciaDeTexto(anterior: string, actual: string): DiferenciaDeTexto {
  let prefijoComun = 0;
  const maxPrefijo = Math.min(anterior.length, actual.length);
  while (prefijoComun < maxPrefijo && anterior[prefijoComun] === actual[prefijoComun]) {
    prefijoComun += 1;
  }

  let sufijoComun = 0;
  const maxSufijo = Math.min(anterior.length, actual.length) - prefijoComun;
  while (
    sufijoComun < maxSufijo &&
    anterior[anterior.length - 1 - sufijoComun] === actual[actual.length - 1 - sufijoComun]
  ) {
    sufijoComun += 1;
  }

  return { prefijoComun, sufijoComun, insertado: actual.length - prefijoComun - sufijoComun };
}
