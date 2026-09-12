import { Ban, Tag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Monto } from "@/components/monto";
import { EditarCategoriaMovimiento } from "@/components/movimientos/editar-categoria-movimiento";
import { useSoloMirar } from "@/hooks/use-perfil";
import type { Categoria, Cuenta, Movimiento } from "@/lib/api/types";
import { horaCorta } from "@/lib/fecha";
import { ETIQUETA_TIPO_MOVIMIENTO } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function MovimientoItem({
  movimiento,
  cuenta,
  categoria,
  mostrarCuenta,
  onSolicitarAnular,
}: {
  movimiento: Movimiento;
  cuenta: Cuenta | undefined;
  categoria: Categoria | undefined;
  mostrarCuenta: boolean;
  onSolicitarAnular: (movimiento: Movimiento) => void;
}) {
  const soloMirar = useSoloMirar();

  const anulado = movimiento.reversedByTransactionId !== null;
  const esAnulacion = movimiento.reversesTransactionId !== null;

  // Anular escribe otro movimiento en el libro, y el libro no se edita. Desde
  // la cuenta de otra persona eso ni se ofrece.
  const puedeAnularse = !soloMirar && !anulado && !esAnulacion && movimiento.kind !== "opening";
  const puedeCategorizarse = movimiento.kind === "standard";

  const descripcion = movimiento.description?.trim() || ETIQUETA_TIPO_MOVIMIENTO[movimiento.kind];

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={anulado ? "text-sm text-muted-foreground line-through" : "text-sm"}>
            {descripcion}
          </span>
          {anulado && (
            <Badge variant="outline" className="text-muted-foreground">
              Anulado
            </Badge>
          )}
          {esAnulacion && <Badge variant="secondary">Anulación</Badge>}
          {movimiento.kind === "opening" && <Badge variant="outline">Saldo inicial</Badge>}
        </div>

        {puedeCategorizarse && (
          <EditarCategoriaMovimiento movimiento={movimiento}>
            <button
              type="button"
              className={cn(
                "inline-flex w-fit items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs transition-colors",
                categoria
                  ? "border-solid bg-muted text-foreground"
                  : "text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              )}
            >
              <Tag className="size-3" />
              {categoria?.name ?? "Categorizar"}
            </button>
          </EditarCategoriaMovimiento>
        )}
        <span className="text-xs text-muted-foreground">
          {mostrarCuenta && cuenta ? `${cuenta.name} · ` : ""}
          {horaCorta(movimiento.occurredAt)}
        </span>
      </div>

      <div className="flex flex-col items-end gap-1">
        <Monto
          valor={movimiento.amount}
          moneda={movimiento.currency}
          className={anulado ? "opacity-50" : undefined}
        />
        {puedeAnularse && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onSolicitarAnular(movimiento)}
          >
            <Ban data-icon="inline-start" />
            Anular
          </Button>
        )}
      </div>
    </div>
  );
}
