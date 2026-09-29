"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckIcon, ListTodo, Plus, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { FalloConsulta, mensajeDeFallo } from "@/components/fallo-consulta";
import { FormularioItemPresupuesto } from "@/components/presupuesto/formulario-item-presupuesto";
import { useChecklistDelMes, useDesarchivarItemPresupuesto, usePresupuestoItems } from "@/hooks/use-presupuesto";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { ItemDelChecklist } from "@/lib/api/types";
import { aUnidadesMinimas, restar, textoMonto } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Qué tan llena va la barra, en porcentaje para el CSS. Se calcula con
 * enteros grandes y se deja en un número solo aquí — es un ancho de barra,
 * no un monto de dinero.
 */
function porcentajeBarra(progress: string, target: string): number {
  const progreso = aUnidadesMinimas(progress);
  const objetivo = aUnidadesMinimas(target);

  if (objetivo <= 0n) return 0;
  if (progreso <= 0n) return 0;
  if (progreso >= objetivo) return 100;

  // Puntos básicos: (progreso / objetivo) * 10000, con enteros exactos.
  return Number((progreso * 10000n) / objetivo) / 100;
}

/**
 * El checklist del mes: qué había que revisar y cómo va cada renglón.
 *
 * Cada renglón es tocable para editar su monto o archivarlo, y en el
 * encabezado vive el botón para agregar uno nuevo. `mes` y `moneda` son los
 * que la pantalla de Resumen ya tiene elegidos.
 *
 * Dos variantes: como tarjeta propia (columna de escritorio, pantalla de
 * Presupuesto) y "suelta" — sin Card ni título — para cuando el panel vive
 * dentro de un cajón que ya trae su propio encabezado: que el cajón sea el
 * único contenedor.
 */
export function PanelPresupuesto({
  mes,
  moneda,
  variante = "tarjeta",
  compartePantalla,
}: {
  mes: string;
  moneda: string;
  variante?: "tarjeta" | "suelta";
  /** `true` cuando otros fallos conviven en la pantalla (el Resumen puede
   * tener varios a la vez): los bloques de este panel dejan de anunciar cada
   * uno por su cuenta — la pantalla compone el anuncio único, o queda un
   * solo alert hablando por todos. */
  compartePantalla?: boolean;
}) {
  const soloMirar = useSoloMirar();
  const {
    data: checklist,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useChecklistDelMes({ month: mes, currency: moneda });
  // Los archivados no son el plato principal pero sí parte de la pantalla:
  // si su consulta falla también se dice, no se esconden como nunca
  // archivados.
  const {
    data: todosLosItems,
    isError: errorDeItems,
    error: porqueFalloItems,
    isFetching: recargandoItems,
    refetch: recargarItems,
  } = usePresupuestoItems(true);
  const desarchivar = useDesarchivarItemPresupuesto();

  const [viendoArchivados, setViendoArchivados] = useState(false);

  // La consulta del checklist no se pudo leer y no hay nada que mostrar: la
  // misma expresión decide el bloque de fallo y si los archivados le ceden
  // el anuncio, así que vive en una sola variable.
  const falloChecklist = isError && !checklist && !isLoading;

  const archivados = (todosLosItems ?? []).filter((item) => item.archivedAt !== null);
  const itemPorId = new Map((todosLosItems ?? []).map((item) => [item.id, item]));

  const accionAgregar = !soloMirar && (
    <FormularioItemPresupuesto moneda={moneda}>
      <Button variant="outline" size="sm">
        <Plus />
        Agregar
      </Button>
    </FormularioItemPresupuesto>
  );

  const cuerpo = (
    <>
      {/* La consulta del checklist no se pudo leer: se dice y se ofrece
          reintentar. "Nada por revisar" sería mentir con el mes en blanco.
          Este es el anuncio principal del panel: conserva su alerta salvo que
          la pantalla ya esté componiendo el anuncio único de varios fallos. */}
      {falloChecklist ? (
        <FalloConsulta
          etiquetaBoton="Reintentar checklist"
          mensaje={mensajeDeFallo(
            error,
            "No pudimos cargar el checklist del mes. Puede ser que el servidor esté dormido."
          )}
          reintento={isFetching}
          onReintentar={() => refetch()}
          compartePantalla={compartePantalla}
        />
      ) : isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ) : !checklist || checklist.items.length === 0 ? (
          <EmptyState
            Icono={ListTodo}
            titulo="Nada por revisar este mes"
            descripcion="Agrega un tope de gasto para una categoría, o una meta para tus ahorros. El progreso se calcula solo con tus movimientos."
            className="border-0 px-2 py-8"
          />
        ) : (
          <ul className="flex flex-col">
            {checklist.items.map((renglon, indice) => {
              const item = itemPorId.get(renglon.id);
              const porcentaje =
                renglon.target !== null
                  ? porcentajeBarra(renglon.progress, renglon.target)
                  : null;

              return (
                <li
                  key={renglon.id}
                  className={cn(
                    indice > 0 && "border-t border-border",
                    !soloMirar && item && "hover:bg-accent/50 -mx-2 rounded-lg"
                  )}
                >
                  {soloMirar || !item ? (
                    <div className="flex flex-col gap-1.5 px-2 py-3">
                      <ContenidoRenglon renglon={renglon} porcentaje={porcentaje} />
                    </div>
                  ) : (
                    <FormularioItemPresupuesto item={item} moneda={moneda}>
                      {/* Un botón de verdad: el Drawer de Base UI exige un
                          <button> nativo como disparador. */}
                      <button
                        type="button"
                        className="flex w-full cursor-pointer flex-col gap-1.5 px-2 py-3 text-left outline-none"
                      >
                        <ContenidoRenglon renglon={renglon} porcentaje={porcentaje} />
                      </button>
                    </FormularioItemPresupuesto>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* La consulta de los ítems falló: sin ella no sabemos qué hay
            archivado, y que el bloque desaparezca en silencio diría un "no
            archivaste nada" que quizá sea mentira. Se dice y se ofrece
            reintentar. Si el checklist también falló, este bloque cede el
            anuncio: dos alertas del mismo panel serían una tormenta — queda
            visible, con su Reintentar, pero no interrumpe dos veces. */}
        {errorDeItems && !todosLosItems ? (
          <div className="mt-3 border-t border-border pt-3">
            <FalloConsulta
              etiquetaBoton="Reintentar archivados"
              mensaje={mensajeDeFallo(
                porqueFalloItems,
                "No pudimos cargar los ítems archivados. Puede ser que el servidor esté dormido."
              )}
              reintento={recargandoItems}
              onReintentar={() => recargarItems()}
              compartePantalla={compartePantalla || falloChecklist}
            />
          </div>
        ) : archivados.length > 0 ? (
          <div className="mt-3 border-t border-border pt-3">
            {viendoArchivados ? (
              <ul className="flex flex-col gap-1 pb-1">
                {archivados.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                    <span className="truncate text-sm text-muted-foreground">
                      {item.label ?? item.categoryName ?? item.accountName}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={soloMirar || desarchivar.isPending}
                      onClick={() =>
                        desarchivar.mutate(item.id, {
                          onSuccess: () => toast.success("Ítem restaurado."),
                          onError: (error) =>
                            toast.error(
                              error instanceof ApiError
                                ? error.message
                                : "No se pudo restaurar. Intenta de nuevo."
                            ),
                        })
                      }
                    >
                      Restaurar
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => setViendoArchivados(!viendoArchivados)}>
              {viendoArchivados ? "Ocultar archivados" : `Archivados (${archivados.length})`}
            </Button>
          </div>
        ) : null}
    </>
  );

  // Variante "suelta": sin Card ni título, para vivos dentro de un cajón o
  // de una pantalla que ya traen su propio encabezado — el cajón (o la
  // pantalla) queda siendo el único contenedor del panel.
  if (variante === "suelta") {
    return (
      <div className="flex flex-col">
        {accionAgregar && <div className="flex justify-end pb-3">{accionAgregar}</div>}
        {cuerpo}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist del mes</CardTitle>
        {accionAgregar && <CardAction>{accionAgregar}</CardAction>}
      </CardHeader>
      <CardContent>{cuerpo}</CardContent>
    </Card>
  );
}

function ContenidoRenglon({
  renglon,
  porcentaje,
}: {
  renglon: ItemDelChecklist;
  porcentaje: number | null;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium">{renglon.label}</span>
        {/* Logro y aviso nunca coinciden: `checked` solo se enciende en una
            meta de ahorro y `exceeded` solo al pasarse de un tope de gasto. */}
        {renglon.checked && (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
            <CheckIcon className="size-3.5" aria-hidden />
            <span className="sr-only">Meta alcanzada</span>
          </span>
        )}
        {renglon.exceeded && (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <TriangleAlert className="size-3.5" aria-hidden />
            <span className="sr-only">Tope excedido</span>
          </span>
        )}
      </div>

      {renglon.target === null ? (
        <p className="text-xs text-muted-foreground">Aún no aplica</p>
      ) : (
        <>
          <div
            role="progressbar"
            aria-valuenow={Math.round(porcentaje ?? 0)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={
              renglon.exceeded
                ? `${renglon.label}: tope excedido, ${textoMonto(renglon.progress, renglon.currency)} de ${textoMonto(renglon.target, renglon.currency)}`
                : `${renglon.label}: ${textoMonto(renglon.progress, renglon.currency)} de ${textoMonto(renglon.target, renglon.currency)}`
            }
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                // El exceso no se celebra: se avisa en rojo (el mismo tono
                // de error que usa el resto de la app). El verde queda para
                // una meta de ahorro alcanzada.
                renglon.exceeded
                  ? "bg-destructive"
                  : renglon.checked
                    ? "bg-emerald-600"
                    : "bg-foreground/60"
              )}
              style={{ width: `${porcentaje ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {/* textoMonto y no <Monto>: el ahorro de un mes puede ser
                negativo (se sacó más de lo que se metió), y un componente
                sin signo lo pintaría como positivo — ahí la barra dice una
                cosa y la cifra otra. */}
            <span className="font-mono tabular-nums">
              {textoMonto(renglon.progress, renglon.currency)}
            </span>
            {" de "}
            <span className="font-mono tabular-nums">
              {textoMonto(renglon.target, renglon.currency)}
            </span>
          </p>
          {renglon.exceeded && (
            <p className="text-xs font-medium text-destructive">
              Te pasaste por{" "}
              <span className="font-mono tabular-nums">
                {textoMonto(restar(renglon.progress, renglon.target), renglon.currency)}
              </span>
            </p>
          )}
        </>
      )}
    </>
  );
}
