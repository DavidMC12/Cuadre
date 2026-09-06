"use client";

import { Plus, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { CuentaCard } from "@/components/cuentas/cuenta-card";
import { FormularioCuenta } from "@/components/cuentas/formulario-cuenta";
import { useCuentas } from "@/hooks/use-cuentas";

export default function PaginaCuentas() {
  const { data: cuentas, isLoading } = useCuentas();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cuentas</h1>
        <FormularioCuenta>
          <Button size="sm">
            <Plus data-icon="inline-start" />
            Nueva
          </Button>
        </FormularioCuenta>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
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
        <div className="flex flex-col gap-2">
          {cuentas.map((cuenta) => (
            <CuentaCard key={cuenta.id} cuenta={cuenta} />
          ))}
        </div>
      )}
    </div>
  );
}
