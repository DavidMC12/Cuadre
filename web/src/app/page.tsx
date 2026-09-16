"use client";

import Link from "next/link";
import { useState } from "react";
import { ListTodo, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
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
import { PanelPresupuesto } from "@/components/presupuesto/panel-presupuesto";
import { SelectorMes } from "@/components/dashboard/selector-mes";
import { ResumenCards } from "@/components/dashboard/resumen-cards";
import { TotalCuentas } from "@/components/dashboard/total-cuentas";
import { TotalAhorrado } from "@/components/dashboard/total-ahorrado";
import { GraficaPorCategoria } from "@/components/dashboard/grafica-por-categoria";
import { GraficaTendencia } from "@/components/dashboard/grafica-tendencia";
import { GraficaAhorro } from "@/components/dashboard/grafica-ahorro";
import { useCuentas } from "@/hooks/use-cuentas";
import { useIrAPantallaDeInicio } from "@/hooks/use-perfil";
import { useMonedas, useResumenMes, useTendencia } from "@/hooks/use-reportes";
import type { TipoCategoria } from "@/lib/api/types";
import { etiquetaMes, mesActual } from "@/lib/fecha";
import { cn } from "@/lib/utils";

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

  // Para el layout de las dos tarjetas de totales importa la moneda que se
  // está viendo: una cuenta de ahorro en dólares no pinta nada al lado de un
  // total en pesos. Y la sección de ahorro (total y gráfica) solo existe si
  // hay una cuenta de ahorro en esa moneda; si no, no se pide nada al servidor
  // ni se muestra un hueco.
  const ahorroEnMoneda = (cuentas ?? []).some(
    (cuenta) => cuenta.isSavings && cuenta.currency === moneda
  );

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
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-10">
      <div className="flex min-w-0 flex-1 flex-col gap-5 xl:max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Resumen</h1>

          {/* En pantallas angostas el checklist vive en un cajón que entra
              deslizándose desde la derecha; desde `xl` la columna de la
              derecha lo muestra siempre, y el botón no hace falta. */}
          {moneda && (
            <Drawer swipeDirection="right">
              <DrawerTrigger render={<Button variant="outline" size="sm" className="xl:hidden" />}>
                <ListTodo />
                Presupuesto
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Presupuesto</DrawerTitle>
                  <DrawerDescription>
                    {etiquetaMes(mes)} · {moneda}
                  </DrawerDescription>
                </DrawerHeader>
                <div className="overflow-y-auto px-4 pb-4">
                  <PanelPresupuesto mes={mes} moneda={moneda} />
                </div>
              </DrawerContent>
            </Drawer>
          )}
        </div>

      {monedas.length > 1 && (
        <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
          <span className="text-muted-foreground">Mostrando</span>
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
        </div>
      )}

      <div className={cn("grid gap-5", ahorroEnMoneda && "sm:grid-cols-2")}>
        <TotalCuentas cuentas={cuentas} moneda={moneda ?? ""} cargando={cargandoCuentas} />
        {ahorroEnMoneda && (
          <TotalAhorrado cuentas={cuentas} moneda={moneda ?? ""} cargando={cargandoCuentas} />
        )}
      </div>

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
            <CardTitle>Tendencia</CardTitle>
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

      {/* Mismos meses que la tendencia: el selector de arriba manda en las dos
          gráficas, para no multiplicar controles. Solo aparece si hay una
          cuenta de ahorro en la moneda que se está viendo. */}
      {ahorroEnMoneda && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Ahorro</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficaAhorro months={mesesTendencia} currency={moneda ?? ""} />
          </CardContent>
        </Card>
      )}

      <Link
        href="/categorias"
        className="self-center text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Editar categorías
      </Link>
      </div>

      {/* Columna del checklist: solo en pantallas anchas. El Resumen conserva
          su ancho de lectura (max-w-3xl) y el espacio que sobra a la derecha
          lo ocupa esta columna, que es la única pantalla que la usa. */}
      {moneda && (
        <aside className="hidden w-80 shrink-0 xl:sticky xl:top-8 xl:block">
          <PanelPresupuesto mes={mes} moneda={moneda} />
        </aside>
      )}
    </div>
  );
}
