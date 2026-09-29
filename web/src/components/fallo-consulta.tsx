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
