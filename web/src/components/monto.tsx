import { esCero, formatearMonto, simboloMoneda } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Menos matemático (U+2212), no un guion: un guion es un signo de puntuación
 * que se presta a leerse como un rango o un guion de palabra; este se lee sin
 * dudar como "negativo".
 */
const MENOS = "−";

export function Monto({
  valor,
  moneda,
  className,
  signo = "ambos",
}: {
  valor: string;
  moneda: string;
  className?: string;
  /** "ambos" muestra +/-, como en un movimiento. "negativo" solo marca lo negativo, útil para saldos. */
  signo?: "ambos" | "negativo";
}) {
  const { negativo, entero, decimales } = formatearMonto(valor, moneda);
  const cero = esCero(valor);
  const mostrarSigno = !cero && (signo === "ambos" || negativo);

  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        // Un gasto resta en tinta normal, como un renglón más del libro: el
        // rojo se guarda para lo que de verdad es un error o no se puede
        // deshacer. Un cero no es ni ingreso ni gasto, así que no se tiñe de
        // ninguno de los dos ni lleva signo.
        cero
          ? "text-muted-foreground"
          : negativo
            ? "text-foreground"
            : "text-emerald-600 dark:text-emerald-400",
        className
      )}
    >
      {mostrarSigno && (negativo ? MENOS : "+")}
      {simboloMoneda(moneda)}
      {entero}
      {decimales && <span className="text-[0.85em] opacity-70">,{decimales}</span>}
    </span>
  );
}
