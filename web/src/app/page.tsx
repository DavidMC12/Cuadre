"use client";

import Link from "next/link";
import { useState } from "react";
import { Wallet } from "lucide-react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/empty-state";
import { SelectorMes } from "@/components/dashboard/selector-mes";
import { ResumenCards } from "@/components/dashboard/resumen-cards";
import { TotalCuentas } from "@/components/dashboard/total-cuentas";
import { GraficaPorCategoria } from "@/components/dashboard/grafica-por-categoria";
import { GraficaTendencia } from "@/components/dashboard/grafica-tendencia";
import { useCuentas } from "@/hooks/use-cuentas";
import { useIrAPantallaDeInicio } from "@/hooks/use-perfil";
import { useMonedas, useResumenMes, useTendencia } from "@/hooks/use-reportes";
import type { TipoCategoria } from "@/lib/api/types";
import { mesActual } from "@/lib/fecha";

export default function PaginaResumen() {
  const [mes, setMes] = useState(mesActual);
  const [monedaElegida, setMonedaElegida] = useState<string | undefined>(undefined);
  const [tipoCategoria, setTipoCategoria] = useState<TipoCategoria>("expense");
  const [mesesTendencia, setMesesTendencia] = useState<6 | 12>(6);

  // Quien eligió abrir en otra pantalla se va de aquí antes de que esto pinte.
  const yendoseAOtraPantalla = useIrAPantallaDeInicio();

  const { data: monedas, isLoading: cargandoMonedas } = useMonedas();
  const moneda = monedaElegida ?? monedas?.[0];

  const { data: cuentas, isLoading: cargandoCuentas } = useCuentas();

  const { data: resumen, isLoading: cargandoResumen } = useResumenMes({
    month: mes,
    currency: moneda ?? "",
  });
  const { data: tendencia, isLoading: cargandoTendencia } = useTendencia({
    months: mesesTendencia,
    currency: moneda ?? "",
  });

  if (cargandoMonedas || yendoseAOtraPantalla) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Resumen</h1>
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!monedas || monedas.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Resumen</h1>
        <EmptyState
          Icono={Wallet}
          titulo="Todavía no hay nada que resumir"
          descripcion="Crea una cuenta y registra tu primer movimiento para ver el resumen del mes."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Resumen</h1>
        {monedas.length > 1 && (
          <Select value={moneda} onValueChange={(valor) => setMonedaElegida(valor ?? undefined)}>
            <SelectTrigger size="sm" className="w-20">
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
        )}
      </div>

      <TotalCuentas cuentas={cuentas} moneda={moneda ?? ""} cargando={cargandoCuentas} />

      <SelectorMes mes={mes} onCambiar={setMes} />

      <ResumenCards resumen={resumen} moneda={moneda ?? ""} cargando={cargandoResumen} />

      {/* Desde `lg` van lado a lado: apiladas dejaban media pantalla vacía
          en escritorio. `min-w-0` para que la gráfica de tendencia pueda
          encogerse hasta el ancho de su columna en vez de desbordarla. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficaPorCategoria
              mes={mes}
              moneda={moneda ?? ""}
              tipo={tipoCategoria}
              onCambiarTipo={setTipoCategoria}
            />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Tendencia ({mesesTendencia} meses)</CardTitle>
            <CardAction>
              <ToggleGroup
                value={[String(mesesTendencia)]}
                onValueChange={(valores) => {
                  if (valores.length > 0) setMesesTendencia(Number(valores[0]) as 6 | 12);
                }}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="6">6 meses</ToggleGroupItem>
                <ToggleGroupItem value="12">12 meses</ToggleGroupItem>
              </ToggleGroup>
            </CardAction>
          </CardHeader>
          <CardContent>
            <GraficaTendencia
              tendencia={tendencia}
              moneda={moneda ?? ""}
              cargando={cargandoTendencia}
            />
          </CardContent>
        </Card>
      </div>

      <Link
        href="/categorias"
        className="self-center text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Editar categorías
      </Link>
    </div>
  );
}
