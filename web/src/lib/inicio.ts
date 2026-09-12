/**
 * A dónde mandar a alguien cuando abre la app.
 *
 * Vive aparte y sin React a propósito: es la única decisión del panel que
 * depende de un estado que sobrevive a los componentes, y eso la vuelve la
 * pieza más fácil de romper sin darse cuenta. Aquí se puede probar sola.
 */
import type { PantallaDeInicio } from "./api/types";

export type DecisionDeInicio =
  /** Todavía no se sabe: no pintes nada que puedas tener que reemplazar. */
  | { accion: "esperar" }
  /** Quédate donde estás. */
  | { accion: "quedarse" }
  | { accion: "irse"; pantalla: Exclude<PantallaDeInicio, "resumen"> };

export interface EstadoDeInicio {
  /** Si el momento de abrir la app ya pasó en esta pestaña. */
  yaSeAbrio: boolean;
  /** Si todavía se está buscando el perfil por primera vez. */
  buscandoPerfil: boolean;
  /** La pantalla elegida, o `undefined` si el perfil no se pudo leer. */
  pantalla: PantallaDeInicio | undefined;
}

export function decidirInicio({
  yaSeAbrio,
  buscandoPerfil,
  pantalla,
}: EstadoDeInicio): DecisionDeInicio {
  // Abrir la app pasa una sola vez. Después, quien toca "Resumen" en el menú
  // se queda en el resumen; si no, quien eligiera otra pantalla de inicio no
  // podría volver a verlo nunca.
  if (yaSeAbrio) return { accion: "quedarse" };

  if (buscandoPerfil) return { accion: "esperar" };

  // La búsqueda terminó sin perfil: la app está caída o la sesión venció. No
  // es momento de mover a nadie de sitio, y el momento de abrir ya se gastó
  // —si no, un perfil que llegue tarde daría un salto de pantalla en plena
  // sesión, sin que nadie haya tocado nada.
  if (!pantalla || pantalla === "resumen") return { accion: "quedarse" };

  return { accion: "irse", pantalla };
}
