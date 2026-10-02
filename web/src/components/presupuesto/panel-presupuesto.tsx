"use client";

import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckIcon, ChevronDown, ListTodo, Plus, TriangleAlert } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { FalloConsulta, mensajeDeFallo } from "@/components/fallo-consulta";
import { FormularioItemPresupuesto } from "@/components/presupuesto/formulario-item-presupuesto";
import { useCategorias } from "@/hooks/use-categorias";
import { useChecklistDelMes, useDesarchivarItemPresupuesto, usePresupuestoItems } from "@/hooks/use-presupuesto";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { ItemDelChecklist } from "@/lib/api/types";
import { agruparPresupuesto, type GrupoPresupuesto } from "@/lib/agrupar-presupuesto";
import { COLOR_NEUTRO, mapaColoresCategoriasDelCatalogo, modoDeTema } from "@/lib/chart-colors";
import { nombreDelMes } from "@/lib/fecha";
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
  topePropio = true,
}: {
  mes: string;
  moneda: string;
  variante?: "tarjeta" | "suelta";
  /** `true` cuando otros fallos conviven en la pantalla (el Resumen puede
   * tener varios a la vez): los bloques de este panel dejan de anunciar cada
   * uno por su cuenta — la pantalla compone el anuncio único, o queda un
   * solo alert hablando por todos. */
  compartePantalla?: boolean;
  /** `false` cuando el contenedor que envuelve al panel ya hace scroll (el
   * cajón móvil): sin tope propio no se anidan dos scroll. En la pantalla de
   * Presupuesto y el aside de escritorio se deja en `true`. */
  topePropio?: boolean;
}) {
  const soloMirar = useSoloMirar();
  const idBase = useId();
  const { resolvedTheme } = useTheme();
  const modo = modoDeTema(resolvedTheme);
  // Mismo catálogo y mismo mapa que la gráfica "Por categoría": una categoría
  // conserva aquí el color que ya tiene en el resto de la app. Con archivos
  // incluidos, porque un ítem puede apuntar a una categoría hoy archivada.
  const { data: catalogo } = useCategorias(true);
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
  // Grupos que la persona replegó. Vacío = todos abiertos: la información se
  // ve de entrada; replegar es una decisión suya, no un estado por defecto.
  const [gruposColapsados, setGruposColapsados] = useState<Set<string>>(new Set());

  function alternarGrupo(clave: string) {
    setGruposColapsados((previos) => {
      const siguientes = new Set(previos);
      if (siguientes.has(clave)) siguientes.delete(clave);
      else siguientes.add(clave);
      return siguientes;
    });
  }

  // La consulta del checklist no se pudo leer y no hay nada que mostrar: la
  // misma expresión decide el bloque de fallo y si los archivados le ceden
  // el anuncio, así que vive en una sola variable.
  const falloChecklist = isError && !checklist && !isLoading;

  const archivados = useMemo(
    () => (todosLosItems ?? []).filter((item) => item.archivedAt !== null),
    [todosLosItems]
  );
  const itemPorId = useMemo(
    () => new Map((todosLosItems ?? []).map((item) => [item.id, item])),
    [todosLosItems]
  );
  // Sin los ítems no hay categoría que agrupar: el checklist por sí solo no la
  // trae. Mientras no lleguen (o si su consulta falla) se muestra plano, en vez
  // de afirmar "Sin categoría" sobre algo que sí la tiene. Se exige que TODOS
  // los renglones tengan su ítem: si la lista llega incompleta, un renglón
  // quedaría sin botón de edición y bajo un grupo que no es el suyo. Es todo o
  // nada: un solo renglón sin ítem deja el panel plano — el precio de no mentir
  // con la categoría, y un caso de carrera que se resuelve al llegar los datos.
  const tieneMetadatos =
    todosLosItems !== undefined &&
    (checklist?.items ?? []).every((renglon) => itemPorId.has(renglon.id));

  // Los mismos ocho tonos (y el gris de la novena en adelante) que las
  // gráficas, con el helper compartido: no pueden divergir. `nombrePorCategoria`
  // resuelve el título cuando el checklist no trae el nombre.
  const { colorPorCategoria, nombrePorCategoria } = useMemo(() => {
    const nombres = new Map<string, string>();
    for (const categoria of catalogo ?? []) nombres.set(categoria.id, categoria.name);
    return {
      colorPorCategoria: mapaColoresCategoriasDelCatalogo(catalogo ?? [], "expense", modo),
      nombrePorCategoria: nombres,
    };
  }, [catalogo, modo]);

  const grupos = useMemo(
    () =>
      tieneMetadatos
        ? agruparPresupuesto(
            checklist?.items ?? [],
            itemPorId,
            (categoryId) => nombrePorCategoria.get(categoryId) ?? null
          )
        : [],
    [tieneMetadatos, checklist?.items, itemPorId, nombrePorCategoria]
  );

  function colorDeGrupo(grupo: GrupoPresupuesto): string {
    if (!grupo.categoryId) return COLOR_NEUTRO[modo];
    return colorPorCategoria.get(grupo.categoryId) ?? COLOR_NEUTRO[modo];
  }

  const accionAgregar = !soloMirar && (
    <FormularioItemPresupuesto moneda={moneda} mes={mes}>
      <Button variant="outline" size="sm">
        <Plus />
        Agregar
      </Button>
    </FormularioItemPresupuesto>
  );

  function renderRenglon(renglon: ItemDelChecklist, indice: number) {
    const item = itemPorId.get(renglon.id);
    const porcentaje =
      renglon.target !== null ? porcentajeBarra(renglon.progress, renglon.target) : null;

    return (
      <li
        key={renglon.id}
        className={cn(
          indice > 0 && "border-t border-border",
          !soloMirar && item && "hover:bg-accent/50 rounded-lg"
        )}
      >
        {soloMirar || !item ? (
          <div className="flex flex-col gap-1.5 px-2 py-3">
            <ContenidoRenglon
              renglon={renglon}
              porcentaje={porcentaje}
              mes={mes}
              puedeEditar={false}
            />
            {/* Sin su ítem no hay formulario que abrir. Mirar otra cuenta es
                solo lectura a propósito y no necesita decir nada; un ítem cuyo
                detalle no llegó sí: si no, el renglón queda sin poder editarse
                y sin explicación. */}
            {!soloMirar && (
              <p className="text-xs text-muted-foreground">
                No pudimos cargar los detalles de este ítem.
              </p>
            )}
          </div>
        ) : (
          // `mes` es el que se está viendo y `montoDelMes` su monto en ese mes
          // (`target`): el formulario fija el monto de ESE mes, no el de hoy.
          <FormularioItemPresupuesto
            item={item}
            moneda={moneda}
            mes={mes}
            montoDelMes={renglon.target}
          >
            {/* Un botón de verdad: el Drawer de Base UI exige un
                <button> nativo como disparador. */}
            <button
              type="button"
              className="flex w-full cursor-pointer flex-col gap-1.5 rounded-lg px-2 py-3 text-left outline-none focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85"
            >
              <ContenidoRenglon
                renglon={renglon}
                porcentaje={porcentaje}
                mes={mes}
                puedeEditar
              />
            </button>
          </FormularioItemPresupuesto>
        )}
      </li>
    );
  }

  const cuerpo = (
    <>
      {/* La consulta del checklist no se pudo leer: se dice y se ofrece
          reintentar. "Nada por revisar" sería mentir con el mes en blanco.
          Este es el anuncio principal del panel: conserva su alerta salvo que
          la pantalla ya esté componiendo el anuncio único de varios fallos. */}
      {falloChecklist ? (
        <FalloConsulta
          etiquetaBoton="Reintentar presupuesto"
          mensaje={mensajeDeFallo(
            error,
            "No pudimos cargar tu presupuesto del mes. Puede ser que el servidor esté dormido."
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
          // La lista se contiene sola: con muchos ítems, el panel ya no crece
          // sin fin ni empuja el resto de la pantalla. La región es enfocable
          // para que también se pueda recorrer con el teclado. Se deja siempre
          // enfocable aunque no llegue a desbordar: medir el desborde real en
          // cada render costaría más de lo que aporta un tab stop de más.
          <div
            role="region"
            aria-label="Ítems del presupuesto"
            tabIndex={0}
            className={cn(
              "flex flex-col overflow-y-auto pr-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85",
              // Con contenedor que ya scrollea (el cajón), el panel no pone su
              // propio tope: evita el scroll anidado.
              topePropio && "max-h-[70vh]"
            )}
          >
            {!tieneMetadatos ? (
              // Aún no sabemos la categoría de cada ítem (o su consulta falló):
              // se ve la lista tal cual, sin encabezados que puedan mentir.
              <ul className="flex flex-col">
                {checklist.items.map((renglon, indice) => renderRenglon(renglon, indice))}
              </ul>
            ) : (
              grupos.map((grupo) => {
                const colapsado = gruposColapsados.has(grupo.clave);
                const idLista = `${idBase}-${grupo.clave}`;
                const cantidad = grupo.items.length;
                // Un tope excedido no puede perderse de vista solo porque el
                // grupo esté replegado: sobrevive como aviso en el encabezado.
                const excedidos = grupo.items.filter((renglon) => renglon.exceeded).length;
                const etiquetaGrupo =
                  `${grupo.titulo}, ${cantidad} ${cantidad === 1 ? "ítem" : "ítems"}` +
                  (colapsado && excedidos > 0
                    ? excedidos === 1
                      ? ", con un tope excedido"
                      : ", con topes excedidos"
                    : "");

                return (
                  <section key={grupo.clave}>
                    <button
                      type="button"
                      aria-expanded={!colapsado}
                      aria-controls={idLista}
                      aria-label={etiquetaGrupo}
                      onClick={() => alternarGrupo(grupo.clave)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85"
                    >
                      {/* El color es refuerzo, nunca el único dato: el nombre de
                          la categoría va en texto, al lado. */}
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colorDeGrupo(grupo) }}
                      />
                      <span className="min-w-0 flex-1 truncate" title={grupo.titulo}>
                        {grupo.titulo}
                      </span>
                      <span className="tabular-nums">{cantidad}</span>
                      {colapsado && excedidos > 0 && (
                        <span
                          aria-hidden
                          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                        >
                          <TriangleAlert className="size-3.5" />
                        </span>
                      )}
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          "size-4 shrink-0 transition-transform",
                          colapsado && "-rotate-90"
                        )}
                      />
                    </button>
                    {/* Siempre montada: `aria-controls` apunta a un id que debe
                        existir aunque el grupo esté replegado. `hidden` la saca
                        de la vista y del árbol accesible sin desmontarla. */}
                    <ul id={idLista} hidden={colapsado} className="flex flex-col">
                      {grupo.items.map((renglon, indice) => renderRenglon(renglon, indice))}
                    </ul>
                  </section>
                );
              })
            )}
          </div>
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
        <CardTitle>Presupuesto del mes</CardTitle>
        {accionAgregar && <CardAction>{accionAgregar}</CardAction>}
      </CardHeader>
      <CardContent>{cuerpo}</CardContent>
    </Card>
  );
}

function ContenidoRenglon({
  renglon,
  porcentaje,
  mes,
  puedeEditar,
}: {
  renglon: ItemDelChecklist;
  porcentaje: number | null;
  /** El mes que se está viendo, para nombrarlo cuando no hay monto. */
  mes: string;
  /** `true` cuando el renglón abre el formulario en edición. */
  puedeEditar: boolean;
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
        // Un ítem sin monto en el mes visto no está "sin aplicar": le falta el
        // monto de ESE mes. Se dice cuál, y si el renglón es editable, se
        // ofrece ponerlo (el mismo renglón abre el formulario en edición).
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Sin monto en {nombreDelMes(mes)}
          </p>
          {puedeEditar && (
            <span className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border px-3 text-sm font-medium">
              Poner monto
            </span>
          )}
        </div>
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
