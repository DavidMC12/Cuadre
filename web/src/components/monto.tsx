import { formatearMonto, simboloMoneda } from "@/lib/money";
import { cn } from "@/lib/utils";

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
  const mostrarSigno = signo === "ambos" || negativo;

  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        negativo ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
        className
      )}
    >
      {mostrarSigno && (negativo ? "-" : "+")}
      {simboloMoneda(moneda)}
      {entero}
      {decimales && <span className="text-[0.85em] opacity-70">,{decimales}</span>}
    </span>
  );
}
