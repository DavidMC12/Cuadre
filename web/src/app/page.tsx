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
import { FalloConsulta, mensajeDeFallo } from "@/components/fallo-consulta";
import { PanelPresupuesto } from "@/components/presupuesto/panel-presupuesto";
import { CuantoMeSobra } from "@/components/dashboard/cuanto-me-sobra";
import { SelectorMes } from "@/components/dashboard/selector-mes";
import { ResumenCards } from "@/components/dashboard/resumen-cards";
import { TotalCuentas } from "@/components/dashboard/total-cuentas";
import { TotalAhorrado } from "@/components/dashboard/total-ahorrado";
import { GraficaPorCategoria } from "@/components/dashboard/grafica-por-categoria";
import { GraficaTendencia } from "@/components/dashboard/grafica-tendencia";
import { GraficaAhorro } from "@/components/dashboard/grafica-ahorro";
import { useCuentas } from "@/hooks/use-cuentas";
import { useIrAPantallaDeInicio } from "@/hooks/use-perfil";
import { usePantallaAncha } from "@/hooks/use-pantalla-ancha";
import { useMonedas, useResumenMes, useTendencia } from "@/hooks/use-reportes";
import type { TipoCategoria } from "@/lib/api/types";
import { CLASES_ASIDE } from "@/lib/aside-resumen";
import { etiquetaMes, mesActual } from "@/lib/fecha";
import { cn } from "@/lib/utils";

export default function PaginaResumen() {
  const [mes, setMes] = useState(mesActual);
  const [monedaElegida, setMonedaElegida] = useState<string | undefined>(undefined);
  const [tipoCategoria, setTipoCategoria] = useState<TipoCategoria>("expense");
  const [mesesTendencia, setMesesTendencia] = useState<6 | 12>(6);
  const pantallaAncha = usePantallaAncha();
  // El fallo del presupuesto lo reporta `CuantoMeSobra` (una sola vez, aunque
  // el panel lo consulte también): la página lo usa para componer el anuncio
  // único y para que ningún bloque se quede sin voz.
  const [falloChecklist, setFalloChecklist] = useState(false);

  // Quien eligió abrir en otra pantalla se va de aquí antes de que esto pinte.
  const yendoseAOtraPantalla = useIrAPantallaDeInicio();

  const {
    data: monedas,
    isLoading: cargandoMonedas,
    isError: errorMonedas,
    error: porqueFalloMonedas,
    isFetching: recargandoMonedas,
    refetch: recargarMonedas,
  } = useMonedas();
  const moneda = monedaElegida ?? monedas?.[0];

  const {
    data: cuentas,
    isLoading: cargandoCuentas,
    isError: errorCuentas,
    error: porqueFalloCuentas,
    isFetching: recargandoCuentas,
    refetch: recargarCuentas,
  } = useCuentas();

  // Para el layout de las dos tarjetas de totales importa la moneda que se
  // está viendo: una cuenta de ahorro en dólares no pinta nada al lado de un
  // total en pesos. Y la sección de ahorro (total y gráfica) solo existe si
  // hay una cuenta de ahorro en esa moneda; si no, no se pide nada al servidor
  // ni se muestra un hueco.
  const ahorroEnMoneda = (cuentas ?? []).some(
    (cuenta) => cuenta.isSavings && cuenta.currency === moneda
  );

  const {
    data: resumen,
    isLoading: cargandoResumen,
    isError: errorResumen,
    error: porqueFalloResumen,
    isFetching: recargandoResumen,
    refetch: recargarResumen,
  } = useResumenMes({
    month: mes,
    currency: moneda ?? "",
  });
  const {
    data: tendencia,
    isLoading: cargandoTendencia,
    isError: errorTendencia,
    error: porqueFalloTendencia,
    isFetching: recargandoTendencia,
    refetch: recargarTendencia,
  } = useTendencia({
    months: mesesTendencia,
    currency: moneda ?? "",
  });

  // Un fallo no es un dato: si una consulta no se pudo leer, no hay cifra que
  // mostrar. Con datos viejos en la memoria se siguen mostrando esos (stale,
  // no falsos); aquí importan solo los casos en que no hay nada que mostrar.
  const falloMonedas = errorMonedas && !monedas;
  const falloCuentas = errorCuentas && !cuentas;
  const falloResumen = errorResumen && !resumen;
  const falloTendencia = errorTendencia && !tendencia;

  // Los fallos que esta pantalla conoce: los tres de sus propias consultas y
  // el del presupuesto, que sube `CuantoMeSobra` (el panel consulta lo mismo;
  // que lo reporte un solo bloque evita contarlo dos veces). Con dos o más
  // caídas a la vez, cada bloque con su propia `role="alert"` sería una
  // tormenta para quien escucha la pantalla: el anuncio pasa a ser uno solo,
  // aquí abajo, y los bloques bajan a `role="group"`. Con un solo fallo se
  // sigue anunciando él, como siempre.
  //
  // Lo que la composición no cubre, a sabiendas: si SOLO fallan consultas que
  // viven adentro de sus componentes sin reportar (por categoría + ahorro),
  // esos bloques siguen siendo alerta cada uno — una tormenta de dos, y
  // necesita que dos endpoints independientes caigan juntos mientras el resto
  // sirve.
  const componenFallosConPresupuesto =
    [falloCuentas, falloResumen, falloTendencia, falloChecklist].filter(Boolean).length >= 2;
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

  // La consulta de monedas no pudo cargar: decirlo y ofrecer reintentar.
  // Mostrar aquí el "Todavía no hay nada que resumir" diría que la CUA no
  // empezó cuando quizá el problema es la conexión.
  if (falloMonedas) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Resumen</h1>
        <FalloConsulta
          etiquetaBoton="Reintentar monedas"
          mensaje={mensajeDeFallo(
            porqueFalloMonedas,
            "No pudimos cargar las monedas. Puede ser que el servidor esté dormido."
          )}
          reintento={recargandoMonedas}
          onReintentar={() => recargarMonedas()}
        />
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
                <div className="scroll-fino [scrollbar-gutter:stable] overflow-y-auto px-4 pb-4">
              {/* Sin Card ni encabezado propio: el cajón ya trae título y los
                  dos contenedores peleaban por encabezar la misma pantalla. */}
                  <PanelPresupuesto
                    mes={mes}
                    moneda={moneda}
                    variante="suelta"
                    compartePantalla={componenFallosConPresupuesto}
                    // El cajón ya scrollea: sin tope propio no se anidan dos.
                    topePropio={false}
                  />
                </div>
              </DrawerContent>
            </Drawer>
          )}
        </div>

      {/* El anuncio único de una caída que toca varias partes a la vez. La
          región vive siempre montada, vacía cuando no hace falta: una región
          viva tiene que existir antes de que cambie su contenido para que el
          anuncio sea fiable — montarla junto con su texto es la receta del
          silencio en varios lectores de pantalla. */}
      <p role="status" className="text-sm text-muted-foreground">
        {componenFallosConPresupuesto &&
          "Varias partes del Resumen no cargaron. Revisa abajo: cada parte tiene su Reintentar."}
      </p>

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

      <div className={cn("grid gap-5", !falloCuentas && ahorroEnMoneda && "sm:grid-cols-2")}>
        {/* Sin datos de cuentas no se suma: el "Tienes" no se inventa un cero. */}
        {falloCuentas ? (
          <FalloConsulta
            etiquetaBoton="Reintentar cuentas"
            mensaje={mensajeDeFallo(
              porqueFalloCuentas,
              "No pudimos cargar tus cuentas. Puede ser que el servidor esté dormido."
            )}
            reintento={recargandoCuentas}
            onReintentar={() => recargarCuentas()}
            // Basta con que OTRO fallo conviva: este bloque deja de anunciar
            // solo y el anuncio único de arriba habla por todos.
            compartePantalla={componenFallosConPresupuesto}
          />
        ) : (
          <>
            <TotalCuentas cuentas={cuentas} moneda={moneda ?? ""} cargando={cargandoCuentas} />
            {ahorroEnMoneda && (
              <TotalAhorrado cuentas={cuentas} moneda={moneda ?? ""} cargando={cargandoCuentas} />
            )}
          </>
        )}
      </div>

      <SelectorMes mes={mes} onCambiar={setMes} />

      <ResumenCards
        resumen={resumen}
        moneda={moneda ?? ""}
        cargando={cargandoResumen}
        compartePantalla={componenFallosConPresupuesto}
        fallo={
          falloResumen
            ? {
                mensaje: mensajeDeFallo(
                  porqueFalloResumen,
                  "No pudimos cargar el resumen del mes. Puede ser que el servidor esté dormido."
                ),
                reintento: recargandoResumen,
                onReintentar: () => recargarResumen(),
                etiquetaBoton: "Reintentar resumen",
              }
            : undefined
        }
      />

      {/* "Cuánto me sobra" ya no compite arriba del presupuesto en la columna
          derecha: es la síntesis del mes, así que va serena a lo ancho de la
          columna principal, justo debajo de las tarjetas de balance y antes del
          detalle de las gráficas. Sin caja pesada: la separa un hilo, la
          jerarquía la lleva el propio contenido (título, cifra prevista,
          real como línea secundaria). Una sola instancia para todos los
          anchos; en xl le cede al panel el anuncio del presupuesto. */}
      {moneda && (
        <section
          aria-labelledby="me-sobra-titulo"
          className="flex flex-col gap-1 border-t border-border pt-5"
        >
          <h2
            id="me-sobra-titulo"
            className="font-heading text-base leading-snug font-medium"
          >
            Cuánto me sobra este mes
          </h2>
          <CuantoMeSobra
            mes={mes}
            moneda={moneda}
            variante="suelta"
            compartePantalla={componenFallosConPresupuesto}
            anunciaPresupuesto={!pantallaAncha}
            onFalloPresupuesto={setFalloChecklist}
          />
        </section>
      )}

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
              // No sabe cuál otro falló ni hace falta: si cualquier otro
              // fallo convive, el suyo deja de anunciar solo.
              compartePantalla={componenFallosConPresupuesto}
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
                // Mismo piso de 44px que el resto de los controles del pulgar:
                // "6 meses"/"12 meses" se tocan igual en el celular.
                size="tap"
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
              compartePantalla={componenFallosConPresupuesto}
              fallo={
                falloTendencia
                  ? {
                      mensaje: mensajeDeFallo(
                        porqueFalloTendencia,
                        "No pudimos cargar la tendencia. Puede ser que el servidor esté dormido."
                      ),
                      reintento: recargandoTendencia,
                      onReintentar: () => recargarTendencia(),
                      etiquetaBoton: "Reintentar tendencia",
                    }
                  : undefined
              }
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
            <GraficaAhorro
              months={mesesTendencia}
              currency={moneda ?? ""}
              compartePantalla={componenFallosConPresupuesto}
            />
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
      {/* Montado solo cuando de verdad se ve: un aside oculto con CSS
          consultaba al servidor igual, aunque nadie lo mirara. */}
      {pantallaAncha && moneda && (
        <aside className={CLASES_ASIDE}>
          <PanelPresupuesto
            mes={mes}
            moneda={moneda}
            compartePantalla={componenFallosConPresupuesto}
            // El aside no scrollea: la lista del panel tiene su propio tope y
            // scrollea dentro de la tarjeta.
          />
        </aside>
      )}
    </div>
  );
}
