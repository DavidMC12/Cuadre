"use client";

import { useEffect, useState } from "react";

/**
 * ¿La ventana está en el tramo `xl` (desde 1280px)?
 *
 * Con un `hidden xl:block` el contenido oculto se seguiría montando —y
 * consultando al servidor— aunque nadie lo vea. Este gancho solo monta lo
 * que de verdad está a la vista. En el servidor y en el primer render dice
 * `false`: en pantallas anchas el contenido aparece un instante después,
 * cuando el navegador ya confirmó el ancho.
 */
export function usePantallaAncha(): boolean {
  const [ancha, setAncha] = useState(false);

  useEffect(() => {
    const consulta = window.matchMedia("(min-width: 1280px)");
    const actualizar = () => setAncha(consulta.matches);
    actualizar();
    consulta.addEventListener("change", actualizar);
    return () => consulta.removeEventListener("change", actualizar);
  }, []);

  return ancha;
}
