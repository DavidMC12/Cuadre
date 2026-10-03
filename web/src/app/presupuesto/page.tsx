"use client";

import { useState } from "react";
import { ListTodo } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { FalloConsulta, mensajeDeFallo } from "@/components/fallo-consulta";
import { SelectorMes } from "@/components/dashboard/selector-mes";
import { PanelPresupuesto } from "@/components/presupuesto/panel-presupuesto";
import { useMonedas } from "@/hooks/use-reportes";
import { mesActual } from "@/lib/fecha";

/**
 * Casa propia del checklist.
 *
 * El panel solo se alcanzaba desde un botón arriba a la derecha del Resumen
 * —justo la zona más difícil del pulgar en celular y una puerta invisible
 * desde las otras tres pantallas—. Con esta página, el ítem "Presupuesto"
 * del menú llega siempre; el cajón del Resumen se queda como atajo de quien
 * está repasando el mes que recién miró.
 */
export default function PaginaPresupuesto() {
  const [mes, setMes] = useState(mesActual);
  const [monedaElegida, setMonedaElegida] = useState<string | undefined>(undefined);

  const {
    data: monedas,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useMonedas();
  const moneda = monedaElegida ?? monedas?.[0];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Presupuesto</h1>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // Un fallo de red no es "aún no tienes presupuesto": se dice y se ofrece
  // reintentar.
  if (isError && !monedas) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Presupuesto</h1>
        <FalloConsulta
          mensaje={mensajeDeFallo(
            error,
            "No pudimos cargar las monedas. Puede ser que el servidor esté dormido."
          )}
          reintento={isFetching}
          onReintentar={() => refetch()}
        />
      </div>
    );
  }

  if (!monedas || monedas.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Presupuesto</h1>
        <EmptyState
          Icono={ListTodo}
          titulo="Aún no hay nada por revisar"
          descripcion="Crea una cuenta y registra tu primer movimiento para empezar tu presupuesto del mes."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Presupuesto</h1>

      {/* Le permite el paso a moneda elegida y al panel: sin cuenta no hay
          checklist; igual que en el Resumen. */}
      {monedas.length > 1 && (
        <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
          <span className="text-muted-foreground">Mostrando</span>
          <Select value={moneda} onValueChange={(valor) => setMonedaElegida(valor ?? undefined)}>
            <SelectTrigger size="sm" className="h-11 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monedas.map((codigo) => (
                <SelectItem key={codigo} value={codigo}>
                  {codigo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <SelectorMes mes={mes} onCambiar={setMes} />

      {/* Variante "suelta": la pantalla ya trae su encabezado; una Card con
          otro título dentro sería un contenedor adentro de otro. */}
      {moneda && <PanelPresupuesto mes={mes} moneda={moneda} variante="suelta" />}
    </div>
  );
}
