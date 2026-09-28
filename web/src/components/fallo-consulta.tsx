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
 */
export function FalloConsulta({
  mensaje,
  reintento = false,
  onReintentar,
  etiquetaBoton,
}: {
  mensaje: string;
  reintento?: boolean;
  onReintentar: () => void;
  /**
   * Para cuando hay más de un bloque de fallo en la misma pantalla: dos
   * botones idénticos no se distinguen de oído (ni de mano).
   */
  etiquetaBoton?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-border p-4"
    >
      <p className="text-sm text-muted-foreground">{mensaje}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onReintentar}
        disabled={reintento}
        aria-label={etiquetaBoton}
      >
        {reintento ? "Reintentando…" : "Reintentar"}
      </Button>
    </div>
  );
}
