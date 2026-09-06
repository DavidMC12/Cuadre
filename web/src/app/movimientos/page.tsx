"use client";

import { useMemo, useState } from "react";
import { Plus, Receipt } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { MovimientoItem } from "@/components/movimientos/movimiento-item";
import { FormularioMovimiento } from "@/components/movimientos/formulario-movimiento";
import { ConfirmarAnulacion } from "@/components/movimientos/confirmar-anulacion";
import { useCuentas } from "@/hooks/use-cuentas";
import { useAnularMovimiento, useMovimientos } from "@/hooks/use-movimientos";
import { ApiError } from "@/lib/api/client";
import type { Movimiento } from "@/lib/api/types";
import { etiquetaFecha } from "@/lib/fecha";

const TODAS_LAS_CUENTAS = "todas";

export default function PaginaMovimientos() {
  const [cuentaFiltro, setCuentaFiltro] = useState(TODAS_LAS_CUENTAS);
  const [movimientoAConfirmar, setMovimientoAConfirmar] = useState<Movimiento | null>(null);

  const { data: cuentas } = useCuentas();
  const { data: movimientos, isLoading } = useMovimientos(
    cuentaFiltro === TODAS_LAS_CUENTAS ? {} : { accountId: cuentaFiltro }
  );
  const anularMovimiento = useAnularMovimiento();

  const cuentasPorId = useMemo(
    () => new Map((cuentas ?? []).map((cuenta) => [cuenta.id, cuenta])),
    [cuentas]
  );

  const grupos = useMemo(() => {
    if (!movimientos) return [];
    const acumulado: { etiqueta: string; items: Movimiento[] }[] = [];
    for (const movimiento of movimientos) {
      const etiqueta = etiquetaFecha(movimiento.occurredAt);
      const grupoActual = acumulado[acumulado.length - 1];
      if (grupoActual && grupoActual.etiqueta === etiqueta) {
        grupoActual.items.push(movimiento);
      } else {
        acumulado.push({ etiqueta, items: [movimiento] });
      }
    }
    return acumulado;
  }, [movimientos]);

  function confirmarAnulacion() {
    if (!movimientoAConfirmar) return;
    anularMovimiento.mutate(movimientoAConfirmar.id, {
      onSuccess: () => {
        toast.success("Movimiento anulado.");
        setMovimientoAConfirmar(null);
      },
      onError: (error) => {
        toast.error(
          error instanceof ApiError ? error.message : "No se pudo anular. Intenta de nuevo."
        );
        setMovimientoAConfirmar(null);
      },
    });
  }

  const hayCuentas = Boolean(cuentas && cuentas.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Movimientos</h1>
        <FormularioMovimiento
          cuentas={cuentas ?? []}
          cuentaIdPorDefecto={cuentaFiltro === TODAS_LAS_CUENTAS ? undefined : cuentaFiltro}
        >
          <Button size="sm">
            <Plus data-icon="inline-start" />
            Nuevo
          </Button>
        </FormularioMovimiento>
      </div>

      {hayCuentas && (
        <Select
          value={cuentaFiltro}
          onValueChange={(valor) => setCuentaFiltro(valor ?? TODAS_LAS_CUENTAS)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS_LAS_CUENTAS}>Todas las cuentas</SelectItem>
            {cuentas!.map((cuenta) => (
              <SelectItem key={cuenta.id} value={cuenta.id}>
                {cuenta.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      )}

      {!isLoading && movimientos && movimientos.length === 0 && (
        <EmptyState
          Icono={Receipt}
          titulo="Todavía no hay movimientos"
          descripcion={
            hayCuentas
              ? "Registra el primer gasto o ingreso para empezar."
              : "Crea primero una cuenta; los movimientos siempre pertenecen a una."
          }
        >
          {hayCuentas && (
            <FormularioMovimiento cuentas={cuentas!}>
              <Button size="sm" className="mt-1">
                <Plus data-icon="inline-start" />
                Registrar movimiento
              </Button>
            </FormularioMovimiento>
          )}
        </EmptyState>
      )}

      {!isLoading && grupos.length > 0 && (
        <div className="flex flex-col gap-4">
          {grupos.map((grupo) => (
            <div key={grupo.etiqueta} className="flex flex-col gap-1">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {grupo.etiqueta}
              </h2>
              <div className="flex flex-col divide-y divide-border">
                {grupo.items.map((movimiento) => (
                  <MovimientoItem
                    key={movimiento.id}
                    movimiento={movimiento}
                    cuenta={cuentasPorId.get(movimiento.accountId)}
                    mostrarCuenta={cuentaFiltro === TODAS_LAS_CUENTAS}
                    onSolicitarAnular={setMovimientoAConfirmar}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmarAnulacion
        movimiento={movimientoAConfirmar}
        procesando={anularMovimiento.isPending}
        onConfirmar={confirmarAnulacion}
        onCancelar={() => setMovimientoAConfirmar(null)}
      />
    </div>
  );
}
