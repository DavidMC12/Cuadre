"use client";

import { useEffect, useRef } from "react";

/**
 * Sube a la pantalla si una consulta anidada no se pudo leer —fallo o pausa sin
 * red— cuando cambia, para que la composición del anuncio único la cuente y no
 * queden dos `role="alert"` compitiendo por la misma causa.
 *
 * Al desmontar avisa `false`: un estado viejo no puede dejar contando una
 * consulta que ya no está en pantalla, porque suprimiría un alert legítimo que
 * sí debería sonar.
 *
 * El callback viaja en un ref para que la limpieza corra solo al desmontar y
 * no cada vez que el padre pase una lambda nueva. El aviso normal depende de
 * `noLeible` y de `avisar`.
 */
export function useSubirNoLeible(
  noLeible: boolean,
  avisar?: (noLeible: boolean) => void
): void {
  const avisarRef = useRef(avisar);

  useEffect(() => {
    avisarRef.current = avisar;
  }, [avisar]);

  useEffect(() => {
    avisar?.(noLeible);
  }, [noLeible, avisar]);

  useEffect(() => {
    return () => avisarRef.current?.(false);
  }, []);
}
