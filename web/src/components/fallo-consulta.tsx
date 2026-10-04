import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";

/**
 * Qué decirle a quien está mirando una consulta que no pudo cargar.
 *
 * Una sesión vencida y una conexión caída saben decirse solos: el servidor
 * ya trae el "vuelve a entrar" en español, y el cliente produce el
 * "sin conexión" cuando ni siquiera se alcanzó a enviar la pregunta. Para
 * todo lo demás el mensaje propio explica mejor lo que pasa. Mismo criterio
 * que Ajustes; aquí solo vive aparte porque varias pantallas consultan
 * cosas y todas merecen esta misma respuesta.
 */
export function mensajeDeFallo(error: unknown, mensaje: string): string {
  return error instanceof ApiError && (error.code === "UNAUTHORIZED" || error.code === "SIN_CONEXION")
    ? error.message
    : mensaje;
}

/** Las señales crudas de una consulta que esta política necesita mirar. Se
 * aceptan por separado y no como el resultado entero de TanStack para que
 * también sirvan con `useInfiniteQuery` y con los dobles de las pruebas. */
export interface SenalesDeConsulta {
  data: unknown;
  isError?: boolean;
  isPaused?: boolean;
  isLoading?: boolean;
}

export type EstadoDeConsulta = "ok" | "cargando" | "fallo" | "pausada";

/**
 * La política única de una consulta, para que ninguna pantalla vuelva a
 * confundir "no se pudo leer" con "no tienes nada".
 *
 * El orden importa:
 * 1. con datos —aunque estén viejos— se muestran: un dato obsoleto no es
 *    falso, así que un refetch fallido no borra lo que ya está en pantalla;
 * 2. sin datos, un fallo manda sobre el esqueleto;
 * 3. sin datos y pausada (sin red) es "sin conexión", no un vacío ni un
 *    esqueleto eterno;
 * 4. mientras carga sin datos, esqueleto.
 */
export function estadoDeConsulta(consulta: SenalesDeConsulta): EstadoDeConsulta {
  // Con datos en mano, siempre "ok": un dato viejo se muestra, no se cambia
  // por un esqueleto ni por un fallo.
  if (consulta.data !== undefined) return "ok";
  if (consulta.isError) return "fallo";
  if (consulta.isPaused === true) return "pausada";
  if (consulta.isLoading) return "cargando";
  return "ok";
}

/**
 * La voz de un fallo del que no sabemos más: sin jerga de servidores ni de
 * infraestructura, que a quien está usando la app no le dice nada.
 */
export function mensajeDeCargaFallida(que: string): string {
  return `No pudimos cargar ${que}. Revisa tu conexión y vuelve a intentarlo.`;
}

/**
 * La voz de una consulta pausada por falta de red. Dice la causa verdadera
 * ("sin conexión") y cómo seguir, en vez de un vacío que miente.
 */
export function mensajeSinConexion(que: string): string {
  return `Sin conexión: no pudimos cargar ${que}. Revisa tu conexión y vuelve a intentarlo.`;
}

/**
 * El bloque de fallo: mensaje y botón para reintentar. Nunca un cero ni un
 * vacío fingiendo que todo está bien — "la cifra es la verdad", y si la
 * consulta no se pudo leer, la cifra no existe todavía.
 *
 * Por defecto es `role="alert"`: en pantallas con una sola consulta, el fallo
 * es EL anuncio y merece interrumpir. Cuando una pantalla puede tener varios
 * fallos a la vez (el Resumen), sus bloques se montan con `compartePantalla`
 * y bajan a `role="group"`: dejan de anunciar cada uno por su cuenta porque
 * la pantalla compone el anuncio único en un `role="status"` que los
 * agrupa a todos — una caída no puede volverse una tormenta de alertas.
 */
export function FalloConsulta({
  mensaje,
  reintento = false,
  onReintentar,
  etiquetaBoton,
  compartePantalla = false,
}: {
  mensaje: string;
  reintento?: boolean;
  onReintentar: () => void;
  /**
   * Para cuando hay más de un bloque de fallo en la misma pantalla: dos
   * botones idénticos no se distinguen de oído (ni de mano).
   */
  etiquetaBoton?: string;
  /** `true` cuando otros fallos conviven en la misma pantalla: el bloque
   * deja de anunciar solo. El anuncio queda en manos de la pantalla — el
   * `role="status"` compuesto cuando hay varios, o el único `alert` que
   * queda en pie cuando el resto cedió. */
  compartePantalla?: boolean;
}) {
  return (
    <div
      role={compartePantalla ? "group" : "alert"}
      className="flex flex-col items-start gap-3 rounded-lg border border-border p-4"
    >
      <p className="text-sm text-muted-foreground">{mensaje}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        // El control de recuperación es el objetivo que más se toca cuando
        // algo salió mal: piso de 44px aunque el texto sea chico.
        className="min-h-11"
        onClick={onReintentar}
        disabled={reintento}
        // Mientras reintenta se le quita la etiqueta: el nombre audible pasa a
        // ser el texto visible "Reintentando…", para que el cambio de estado
        // se oiga también.
        aria-label={reintento ? undefined : etiquetaBoton}
      >
        {reintento ? "Reintentando…" : "Reintentar"}
      </Button>
    </div>
  );
}
