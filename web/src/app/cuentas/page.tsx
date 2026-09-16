"use client";

import { Plus, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { CuentaCard } from "@/components/cuentas/cuenta-card";
import { FormularioCuenta } from "@/components/cuentas/formulario-cuenta";
import { useCuentas } from "@/hooks/use-cuentas";
import { agruparCuentasPorMoneda } from "@/lib/agrupar-cuentas";

export default function PaginaCuentas() {
  const { data: cuentas, isLoading } = useCuentas();

  const grupos = agruparCuentasPorMoneda(cuentas ?? []);
  // Con una sola moneda el encabezado no dice nada que la pantalla ya no
  // diga: solo aparece si hay más de un grupo.
  const mostrarEncabezadoDeMoneda = grupos.size > 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cuentas</h1>
        <FormularioCuenta>
          {/* Sin `data-icon`: esa marca le da al botón un relleno más
              angosto del lado del ícono, y acá compite con `px-4` — el
              botón queda con menos aire de un lado que del otro. */}
          <Button size="sm" className="h-10 gap-1.5 px-4">
            <Plus />
            Nueva
          </Button>
        </FormularioCuenta>
      </div>

      {isLoading && (
        <div className="grid gap-2 lg:grid-cols-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      )}

      {!isLoading && cuentas && cuentas.length === 0 && (
        <EmptyState
          Icono={Wallet}
          titulo="Todavía no tienes cuentas"
          descripcion="Crea la primera para empezar a registrar tus movimientos."
        >
          <FormularioCuenta>
            <Button size="sm" className="mt-1">
              <Plus data-icon="inline-start" />
              Crear cuenta
            </Button>
          </FormularioCuenta>
        </EmptyState>
      )}

      {!isLoading && cuentas && cuentas.length > 0 && (
        <div className="flex flex-col gap-4">
          {[...grupos].map(([moneda, cuentasDeMoneda]) => (
            <div key={moneda} className="flex flex-col gap-2">
              {mostrarEncabezadoDeMoneda && (
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {moneda}
                </span>
              )}
              <div className="grid gap-2 lg:grid-cols-2">
                {cuentasDeMoneda.map((cuenta) => (
                  <CuentaCard key={cuenta.id} cuenta={cuenta} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
