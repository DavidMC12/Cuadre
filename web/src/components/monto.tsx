import { esCero, formatearMonto, MENOS, simboloMoneda } from "@/lib/money";
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
  /**
   * "ambos" muestra +/-, como en un movimiento. "negativo" solo marca lo
   * negativo, útil para saldos. "ninguno" no muestra signo ni se tiñe de
   * verde ni de rojo: para una transferencia, que ni entra ni sale, solo
   * cambia de cuenta. "neutro" tampoco se tiñe, pero sí marca el menos
   * cuando resta: para una cifra que no es ni ganancia ni ingreso (el
   * previsto de un presupuesto), donde el verde mentiría.
   */
  signo?: "ambos" | "negativo" | "ninguno" | "neutro";
}) {
  const { negativo, entero, decimales } = formatearMonto(valor, moneda);
  const cero = esCero(valor);
  const mostrarSigno =
    signo !== "ninguno" && !cero && (signo === "ambos" || signo === "neutro" || negativo);

  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        // Un gasto resta en tinta normal, como un renglón más del libro: el
        // rojo se guarda para lo que de verdad es un error o no se puede
        // deshacer. Un cero no es ni ingreso ni gasto, así que no se tiñe de
        // ninguno de los dos ni lleva signo; una transferencia tampoco, por
        // la misma razón. Una cifra neutra (el previsto) tampoco: no es una
        // ganancia.
        cero || signo === "ninguno" || signo === "neutro"
          ? "text-muted-foreground"
          : negativo
            ? "text-foreground"
            : "text-emerald-600 dark:text-emerald-400",
        className
      )}
    >
      {mostrarSigno && (negativo ? MENOS : signo === "neutro" ? "" : "+")}
      {simboloMoneda(moneda)}
      {entero}
      {decimales && <span className="text-[0.85em] opacity-70">,{decimales}</span>}
    </span>
  );
}
