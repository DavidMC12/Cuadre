"use client";

import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckIcon, ChevronDown, ListTodo, Plus, TriangleAlert } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { FalloConsulta, estadoDeConsulta, mensajeDeCargaFallida, mensajeDeFallo, mensajeSinConexion } from "@/components/fallo-consulta";
import { Monto } from "@/components/monto";
import { FormularioItemPresupuesto } from "@/components/presupuesto/formulario-item-presupuesto";
import { useCategorias } from "@/hooks/use-categorias";
import { useGruposColapsados } from "@/hooks/use-grupos-colapsados";
import { useChecklistDelMes, useDesarchivarItemPresupuesto, usePresupuestoItems } from "@/hooks/use-presupuesto";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { ItemDelChecklist } from "@/lib/api/types";
import {
  agruparPresupuesto,
  CLAVE_AHORRO,
  CLAVE_SIN_CATEGORIA,
  type GrupoPresupuesto,
} from "@/lib/agrupar-presupuesto";
import {
  CLASES_BLOQUE_ASIDE,
  CLASES_CARD_PANEL_VENTANA,
  CLASES_ENCABEZADO_GRUPO,
  CLASES_ENCABEZADO_GRUPO_FIJO,
  CLASES_ENCABEZADO_SECCION,
  CLASES_REGION_PANEL,
  CLASES_REGION_PANEL_CON_TOPE,
  CLASES_REGION_PANEL_VENTANA,
  CLASES_TITULO_SECCION,
} from "@/lib/aside-resumen";
import { COLOR_NEUTRO, mapaColoresCategoriasDelCatalogo, modoDeTema } from "@/lib/chart-colors";
import { totalesPrevistos } from "@/lib/cuanto-sobra";
import { nombreDelMes } from "@/lib/fecha";
import { aUnidadesMinimas, esCero, restar, textoMonto } from "@/lib/money";
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
 * El estado del renglón en PALABRAS, no solo de color: Pendiente / Parcial y
 * el logro — Pagado (tope de gasto), Recibido (ingreso esperado), Cumplida
 * (meta de ahorro). Los otros estados ya tienen su propia frase en el
 * renglón ("Te pasaste por X", "Sin presupuesto este mes", "Sin monto en
 * X"), así que aquí no se repiten: `null` = el renglón ya habla por sí solo.
 */
function palabraDeEstado(renglon: ItemDelChecklist): string | null {
  if (renglon.target === null) return null;
  if (esCero(renglon.target)) return null;
  if (renglon.status === "exceeded" || renglon.status === "none") return null;
  switch (renglon.status) {
    case "paid":
      return renglon.kind === "savings"
        ? "Cumplida"
        : renglon.categoryKind === "income"
          ? "Recibido"
          : "Pagado";
    case "pending":
      return "Pendiente";
    case "partial":
      return "Parcial";
    default:
      return null;
  }
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
    isPaused: pausaChecklist,
    isFetching,
    refetch,
  } = useChecklistDelMes({ month: mes, currency: moneda });
  // Los archivados no son el plato principal pero sí parte de la pantalla:
  // si su consulta falla o queda pausada sin red también se dice, no se
  // esconden como nunca archivados.
  const {
    data: todosLosItems,
    isError: errorDeItems,
    isPaused: pausaItems,
    error: porqueFalloItems,
    isFetching: recargandoItems,
    refetch: recargarItems,
  } = usePresupuestoItems(true);
  const desarchivar = useDesarchivarItemPresupuesto();

  const [viendoArchivados, setViendoArchivados] = useState(false);

  // La política única del panel: un fallo sin datos o una consulta pausada sin
  // red no pueden dibujarse como "nada por revisar". La misma expresión decide
  // el bloque de fallo y si los archivados le ceden el anuncio.
  const estadoChecklist = estadoDeConsulta({
    data: checklist,
    isError,
    isPaused: pausaChecklist,
    isLoading,
  });
  const falloChecklist = estadoChecklist === "fallo";
  const pausadaChecklist = estadoChecklist === "pausada";
  const estadoItems = estadoDeConsulta({
    data: todosLosItems,
    isError: errorDeItems,
    isPaused: pausaItems,
  });
  const falloItems = estadoItems === "fallo";
  const pausadaItems = estadoItems === "pausada";

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
  // gráficas, con el helper compartido: no pueden divergir. Un mapa por tipo,
  // porque la gráfica asigna colores dentro de cada tipo (gastos por un lado,
  // ingresos por otro). `nombrePorCategoria` resuelve el título cuando el
  // checklist no trae el nombre.
  const { colorPorCategoriaGasto, colorPorCategoriaIngreso, nombrePorCategoria } = useMemo(() => {
    const nombres = new Map<string, string>();
    for (const categoria of catalogo ?? []) nombres.set(categoria.id, categoria.name);
    return {
      colorPorCategoriaGasto: mapaColoresCategoriasDelCatalogo(catalogo ?? [], "expense", modo),
      colorPorCategoriaIngreso: mapaColoresCategoriasDelCatalogo(catalogo ?? [], "income", modo),
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

  // Los totales de sección salen de la MISMA cuenta que arma el previsto del
  // cuadrito "Cuánto me sobra": una sola fuente, para que la resta a la vista
  // (ingresos − gastos) y el previsto no puedan diferir jamás. El total de un
  // lado solo se pinta si ese lado tiene al menos un renglón con monto
  // (`hayIngresos`/`hayGastos`): nunca un cero inventado.
  const totales = useMemo(() => totalesPrevistos(checklist?.items ?? []), [checklist?.items]);

  // Lo movido SIN item, por categoría: el servidor solo manda los renglones
  // con monto distinto de cero. Se resuelve una vez para que cada grupo mire
  // el suyo al pintarse.
  const sinAsignarDe = useMemo(
    () => new Map((checklist?.unassigned ?? []).map((renglon) => [renglon.categoryId, renglon])),
    [checklist?.unassigned]
  );

  // Claves que pueden tener preferencia guardada: las del catálogo completo
  // (archivadas incluidas) más las propias del panel, más las de los grupos de
  // este mes por si un ítem apunta a una categoría que no está en el catálogo.
  // Mientras el catálogo no llegue es `null`: sin podar, para no borrar nada de
  // una consulta en curso.
  const clavesValidas = useMemo(() => {
    if (!catalogo) return null;
    const claves = new Set<string>([CLAVE_AHORRO, CLAVE_SIN_CATEGORIA]);
    for (const categoria of catalogo) claves.add(categoria.id);
    for (const grupo of grupos) claves.add(grupo.clave);
    return claves;
  }, [catalogo, grupos]);
  // Los grupos replegados se recuerdan en el navegador (preferencia de pantalla,
  // no dinero) y se comparten entre el Resumen y /presupuesto, entre meses y
  // monedas. Vacío = todos abiertos: replegar es una decisión de quien usa la
  // app, no un estado por defecto.
  const {
    colapsados: gruposColapsados,
    alternar: alternarGrupo,
    contraerTodo,
    expandirTodo,
  } = useGruposColapsados(clavesValidas);

  // Dos secciones, como el dinero: lo que se espera recibir y lo que se espera
  // gastar. El ahorro es del segundo tipo (apartar, no recibir) y cierra
  // "Gastos". Un renglón sin tipo de categoría (defensivo) cuenta como gasto.
  // Ojo: el TOTAL de la sección sale de `totalesPrevistos`, que solo suma
  // ingresos y gastos con tipo; un renglón defensivo sin tipo no entraría en
  // ninguna suma. Es un estado que los datos no producen (un ítem de categoría
  // siempre trae su tipo), y el cuadrito "Cuánto me sobra" usa la misma cuenta.
  const gruposIngreso = grupos.filter(
    (grupo) => grupo.items[0]?.categoryKind === "income"
  );
  const gruposGasto = grupos.filter(
    (grupo) => grupo.items[0]?.categoryKind !== "income"
  );

  function colorDeGrupo(grupo: GrupoPresupuesto, mapa: Map<string, string>): string {
    if (!grupo.categoryId) return COLOR_NEUTRO[modo];
    return mapa.get(grupo.categoryId) ?? COLOR_NEUTRO[modo];
  }

  // La tarjeta (el aside) se ajusta a la ventana: su lista toma el alto que
  // sobra y scrollea ella, no la columna. Ahí también los encabezados de grupo
  // se pegan al scroll de la lista. En la variante suelta (/presupuesto y el
  // cajón) no: la superficie no es `bg-card` y un encabezado opaco dejaría una
  // banda de otro color en tema oscuro.
  const enVentana = variante === "tarjeta";

  const accionAgregar = !soloMirar && (
    <FormularioItemPresupuesto moneda={moneda} mes={mes}>
      <Button variant="outline" size="sm" className="min-h-11">
        <Plus />
        Agregar
      </Button>
    </FormularioItemPresupuesto>
  );

  // Un solo botón que alterna y que siempre está visible mientras haya
  // grupos: "Contraer todo" con al menos uno abierto; "Desplegar todo" con
  // todos cerrados. Con la lista plana (sin grupos) no hay nada que alternar.
  const hayGrupos = grupos.length > 0;
  const cerradosVisibles = grupos.filter((grupo) => gruposColapsados.has(grupo.clave)).length;
  const todosCerrados = hayGrupos && cerradosVisibles === grupos.length;
  // Pista de lo recordado: quien vuelve ve una categoría replegada y no sabe
  // si no tiene ítems o si él la cerró. Cuando hay algo cerrado —pero no todo,
  // que ya lo dice "Desplegar todo"— una entrada discreta al lado del
  // alternante cuenta cuántas son y las muestra todas. Sin color como único
  // portador y con piso de 44px.
  const pistaCerradas = cerradosVisibles > 0 && !todosCerrados && (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-11 text-muted-foreground"
      // El nombre audible dice la acción (no solo el conteo): quien lo enfoca
      // de oído sabe que lo toca para desplegar. El texto visible conserva el
      // conteo.
      aria-label={
        cerradosVisibles === 1
          ? "Desplegar 1 categoría cerrada"
          : `Desplegar ${cerradosVisibles} categorías cerradas`
      }
      onClick={expandirTodo}
    >
      {cerradosVisibles === 1 ? "1 categoría cerrada" : `${cerradosVisibles} categorías cerradas`}
    </Button>
  );
  const accionAlternar = hayGrupos && (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-11"
      aria-label={todosCerrados ? "Desplegar todo" : "Contraer todo"}
      onClick={() =>
        todosCerrados ? expandirTodo() : contraerTodo(grupos.map((grupo) => grupo.clave))
      }
    >
      {todosCerrados ? "Desplegar todo" : "Contraer todo"}
    </Button>
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
              className="flex w-full cursor-pointer scroll-mt-11 flex-col gap-1.5 rounded-lg px-2 py-3 text-left outline-none focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85"
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

  function renderGrupo(grupo: GrupoPresupuesto, mapa: Map<string, string>) {
    const colapsado = gruposColapsados.has(grupo.clave);
    const idLista = `${idBase}-${grupo.clave}`;
    const cantidad = grupo.items.length;
    // Un tope excedido no puede perderse de vista solo porque el grupo esté
    // replegado: sobrevive como aviso en el encabezado.
    const excedidos = grupo.items.filter((renglon) => renglon.exceeded).length;
    const etiquetaGrupo =
      `${grupo.titulo}, ${cantidad} ${cantidad === 1 ? "ítem" : "ítems"}` +
      (colapsado && excedidos > 0
        ? excedidos === 1
          ? ", con un tope excedido"
          : ", con topes excedidos"
        : "");

    return (
      <div key={grupo.clave}>
        <button
          type="button"
          aria-expanded={!colapsado}
          aria-controls={idLista}
          aria-label={etiquetaGrupo}
          onClick={() => alternarGrupo(grupo.clave)}
          className={cn(CLASES_ENCABEZADO_GRUPO, enVentana && CLASES_ENCABEZADO_GRUPO_FIJO)}
        >
          {/* El color es refuerzo, nunca el único dato: el nombre de la
              categoría va en texto, al lado. */}
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: colorDeGrupo(grupo, mapa) }}
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
            className={cn("size-4 shrink-0 transition-transform", colapsado && "-rotate-90")}
          />
        </button>
        {/* Siempre montada: `aria-controls` apunta a un id que debe existir
            aunque el grupo esté replegado. `hidden` la saca de la vista y del
            árbol accesible sin desmontarla. */}
        <ul id={idLista} hidden={colapsado} className="flex flex-col">
          {grupo.items.map((renglon, indice) => renderRenglon(renglon, indice))}
          {/* Lo movido sin item en ESTA categoría (el servidor solo lo manda
              cuando no es cero): una fila de texto apagado, sin barra, para
              que no se pierda plata en el cuadre por cada grupo. Los grupos
              sin categoría (Clave propia) no tienen dónde caer: su item no
              existe, así que nada aparece. */}
          {grupo.categoryId !== null && sinAsignarDe.get(grupo.categoryId) && (
            <li className="border-t border-border px-2 py-2 text-xs text-muted-foreground">
              Sin asignar:{" "}
              <span className="font-mono tabular-nums">
                {textoMonto(sinAsignarDe.get(grupo.categoryId)!.amount, moneda)}
              </span>
            </li>
          )}
        </ul>
      </div>
    );
  }

  const cuerpo = (
    <>
      {/* La consulta del checklist no se pudo leer, o quedó pausada sin red:
          se dice y se ofrece reintentar. "Nada por revisar" sería mentir con
          el mes en blanco. Este es el anuncio principal del panel: conserva su
          alerta salvo que la pantalla ya esté componiendo el anuncio único de
          varios fallos. */}
      {falloChecklist ? (
        <FalloConsulta
          etiquetaBoton="Reintentar presupuesto"
          mensaje={mensajeDeFallo(error, mensajeDeCargaFallida("tu presupuesto del mes"))}
          reintento={isFetching}
          onReintentar={() => refetch()}
          compartePantalla={compartePantalla}
        />
      ) : pausadaChecklist ? (
        <FalloConsulta
          etiquetaBoton="Reintentar presupuesto"
          mensaje={mensajeSinConexion("tu presupuesto del mes")}
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
            descripcion="Agrega un tope de gasto, un ingreso esperado o una meta de ahorro. El progreso se calcula con tus movimientos y tus anotaciones de ahorro."
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
              CLASES_REGION_PANEL,
              enVentana
                ? CLASES_REGION_PANEL_VENTANA
                : topePropio && CLASES_REGION_PANEL_CON_TOPE
            )}
          >
            {!tieneMetadatos ? (
              // Aún no sabemos la categoría de cada ítem (o su consulta falló):
              // se ve la lista tal cual, sin encabezados que puedan mentir.
              <ul className="flex flex-col">
                {checklist.items.map((renglon, indice) => renderRenglon(renglon, indice))}
              </ul>
            ) : (
              <>
                {gruposIngreso.length > 0 && (
                  <section
                    aria-labelledby={`${idBase}-seccion-ingresos`}
                    className="flex flex-col"
                  >
                    <EncabezadoSeccion
                      id={`${idBase}-seccion-ingresos`}
                      rotulo="Ingresos"
                      moneda={moneda}
                      total={totales.hayIngresos ? totales.ingresos : null}
                      etiquetaTotal="Total de ingresos previstos"
                    />
                    {gruposIngreso.map((grupo) => renderGrupo(grupo, colorPorCategoriaIngreso))}
                  </section>
                )}
                {gruposGasto.length > 0 && (
                  <section
                    aria-labelledby={`${idBase}-seccion-gastos`}
                    className="flex flex-col"
                  >
                    <EncabezadoSeccion
                      id={`${idBase}-seccion-gastos`}
                      rotulo="Gastos"
                      moneda={moneda}
                      total={totales.hayGastos ? totales.gastos : null}
                      etiquetaTotal="Total de gastos previstos"
                    />
                    {gruposGasto.map((grupo) => renderGrupo(grupo, colorPorCategoriaGasto))}
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* La consulta de los ítems falló: sin ella no sabemos qué hay
            archivado, y que el bloque desaparezca en silencio diría un "no
            archivaste nada" que quizá sea mentira. Se dice y se ofrece
            reintentar. Si el checklist también falló, este bloque cede el
            anuncio: dos alertas del mismo panel serían una tormenta — queda
            visible, con su Reintentar, pero no interrumpe dos veces. */}
        {falloItems ? (
          <div className="mt-3 shrink-0 border-t border-border pt-3">
            <FalloConsulta
              etiquetaBoton="Reintentar archivados"
              mensaje={mensajeDeFallo(porqueFalloItems, mensajeDeCargaFallida("los ítems archivados"))}
              reintento={recargandoItems}
              onReintentar={() => recargarItems()}
              compartePantalla={compartePantalla || falloChecklist || pausadaChecklist}
            />
          </div>
        ) : pausadaItems ? (
          <div className="mt-3 shrink-0 border-t border-border pt-3">
            <FalloConsulta
              etiquetaBoton="Reintentar archivados"
              mensaje={mensajeSinConexion("los ítems archivados")}
              onReintentar={() => recargarItems()}
              compartePantalla={compartePantalla || falloChecklist || pausadaChecklist}
            />
          </div>
        ) : archivados.length > 0 ? (
          <div className="mt-3 shrink-0 border-t border-border pt-3">
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
                      className="min-h-11"
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
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              onClick={() => setViendoArchivados(!viendoArchivados)}
            >
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
        {(pistaCerradas || accionAlternar || accionAgregar) && (
          <div className="flex flex-wrap items-center justify-end gap-1 pb-3">
            {pistaCerradas}
            {accionAlternar}
            {accionAgregar}
          </div>
        )}
        {cuerpo}
      </div>
    );
  }

  return (
    <Card className={cn(CLASES_BLOQUE_ASIDE, enVentana && CLASES_CARD_PANEL_VENTANA)}>
      <CardHeader className={cn(enVentana && "shrink-0")}>
        {/* El título en su fila, con solo "Agregar" a la derecha: a 320px el
            alternar ya no cabe en esa fila y pasa a la suya (abajo). */}
        <CardTitle className="min-w-0 truncate">Presupuesto del mes</CardTitle>
        {accionAgregar && <CardAction>{accionAgregar}</CardAction>}
      </CardHeader>
      <CardContent className={cn(enVentana && "flex min-h-0 flex-1 flex-col")}>
        {/* El alternar va debajo del título, discreto y a la derecha: es una
            acción de la lista entera, no de una sección (puede haber Ingresos
            y Gastos), y así el encabezado no se aprieta. La pista de las
            cerradas lo acompaña cuando hace falta. */}
        {enVentana && (pistaCerradas || accionAlternar) && (
          <div className="flex shrink-0 flex-wrap justify-end gap-1 pb-1">
            {pistaCerradas}
            {accionAlternar}
          </div>
        )}
        {cuerpo}
      </CardContent>
    </Card>
  );
}

/**
 * El encabezado de una sección del panel (Ingresos / Gastos): el rótulo a la
 * izquierda y, en la misma fila, el total del mes a la derecha. Es discreto
 * (tinta apagada, `tabular-nums`) para no competir con el título del panel, y
 * el reparto lo fija `CLASES_ENCABEZADO_SECCION`: si rótulo y total no caben,
 * el rótulo recorta —el total nunca se pierde—.
 *
 * `total` vale `null` cuando la sección no tiene ningún renglón con monto: no
 * se inventa un cero. Cuando lo hay, el total lleva su texto en palabras
 * ("Total de ingresos previstos: $…") para quien usa lector de pantalla; el
 * monto exacto sale del componente `Monto`, con signo neutro.
 */
function EncabezadoSeccion({
  id,
  rotulo,
  moneda,
  total,
  etiquetaTotal,
}: {
  id: string;
  rotulo: string;
  moneda: string;
  total: string | null;
  /** La frase con la que se nombra el total; el monto se le pega detrás. */
  etiquetaTotal: string;
}) {
  return (
    <div className={CLASES_ENCABEZADO_SECCION}>
      <h3 id={id} className={CLASES_TITULO_SECCION}>
        {rotulo}
      </h3>
      {total !== null && (
        // `role="img"` + `aria-label`: el mismo patrón accesible de las gráficas
        // del Resumen. Un `span` genérico con `aria-label` no es un nombre
        // fiable (el rol genérico no admite nombre por autor) y el lector podía
        // ignorar las palabras o leerlas dos veces junto a la cifra visible; con
        // `role="img"` el texto de adentro queda presentacional y solo se
        // anuncia el nombre en palabras. `whitespace-nowrap`: el total nunca se
        // parte en dos líneas; cede el rótulo, no la cifra.
        <span
          className="shrink-0 whitespace-nowrap"
          role="img"
          aria-label={`${etiquetaTotal}: ${textoMonto(total, moneda)}`}
        >
          <Monto valor={total} moneda={moneda} signo="neutro" className="text-xs font-medium" />
        </span>
      )}
    </div>
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
  // El verbo dice qué se está midiendo: lo recibido en un ingreso, lo gastado
  // en un tope de gasto, lo apartado en una meta de ahorro.
  const verbo =
    renglon.kind === "savings" ? "ahorrado" : renglon.categoryKind === "income" ? "recibido" : "gastado";

  // "Este mes no aplica": el mes visto tiene un monto fijado y es 0
  // ("0.0000" es truthy — el cero se lee con `esCero`, nunca con la
  // verdad/falsedad del string; `target` null es otra cosa: "no existía
  // ese mes", no "sin presupuesto"). El servidor manda `checked` false y
  // `exceeded` true si se gastó sobre ese 0; en un ingreso una meta no
  // se puede pasar nunca, y en ahorro tampoco.
  const noAplica = renglon.target !== null && esCero(renglon.target);

  // El rojo de "te pasaste" es solo para un tope de gasto. En un ingreso,
  // recibir de más es bueno: aunque el estado llegara con `exceeded`, el panel
  // no lo tiñe de alarma. El estado verde (`checked`) sí se respeta.
  const excedeGasto = renglon.exceeded && renglon.categoryKind !== "income";

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "truncate text-sm font-medium",
            // Atenuado con palabras, no solo de color: el propio renglón
            // dice "sin presupuesto/sin meta este mes" más abajo, y el
            // gris solo refuerza que este mes va aparte.
            noAplica && "text-muted-foreground font-normal"
          )}
        >
          {renglon.label}
        </span>
        {/* El estado va en palabras cortas y a la vista: se ve de un vistazo
            y se lee igual de oído. "Te pasaste por X" y "Sin presupuesto
            este mes" ya se dicen en el cuerpo del renglón, así que aquí
            solo aparecen Pendiente / Parcial / y el logro. */}
        {palabraDeEstado(renglon) && (
          <span
            className={cn(
              "shrink-0 text-xs font-medium",
              renglon.status === "paid"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground"
            )}
          >
            {palabraDeEstado(renglon)}
          </span>
        )}
        {/* Los estados no se pisan: `checked` (logro verde) se enciende al
            alcanzar una meta de ahorro o un ingreso esperado; `exceeded` (aviso
            rojo) SOLO al pasarse de un tope de gasto. Recibir más de lo
            presupuestado es bueno: nunca sale en rojo. */}
        {renglon.checked && (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
            <CheckIcon className="size-3.5" aria-hidden />
            <span className="sr-only">Meta alcanzada</span>
          </span>
        )}
        {excedeGasto && (
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
            // El control es el renglón entero (abre el formulario); esto es su
            // aspecto de botón, no un segundo control. Por eso `aria-hidden`:
            // que el lector de pantalla no anuncie un botón que no existe.
            <span
              aria-hidden
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border px-3 text-sm font-medium"
            >
              Poner monto
            </span>
          )}
        </div>
      ) : noAplica ? (
        // Sin barra, sin porcentaje y sin cifras: con objetivo cero una
        // barra no mide nada (la división daría sin sentido) y un "0 gastado
        // de 0" sería ruido. En palabras, y mismo remedio que en "sin
        // monto": el renglón entero sigue tocable para reponer.
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {renglon.categoryKind === "income" ? "Sin meta este mes" : "Sin presupuesto este mes"}
          </p>
          {excedeGasto && (
            // Un tope de cero está excedido con lo mínimo: el aviso en rojo
            // es el mismo bloque del resto de excedidos y manda sobre la
            // calma del renglón atenuado. restar(progress, "0.0000") es
            // el propio gasto; nada divide entre cero.
            <p className="text-xs font-medium text-destructive">
              Te pasaste por{" "}
              <span className="font-mono tabular-nums">
                {textoMonto(restar(renglon.progress, renglon.target), renglon.currency)}
              </span>
            </p>
          )}
          {puedeEditar && (
            <span
              aria-hidden
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border px-3 text-sm font-medium"
            >
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
              excedeGasto
                ? `${renglon.label}: tope excedido, ${textoMonto(renglon.progress, renglon.currency)} ${verbo} de ${textoMonto(renglon.target, renglon.currency)}`
                : `${renglon.label}: ${textoMonto(renglon.progress, renglon.currency)} ${verbo} de ${textoMonto(renglon.target, renglon.currency)}`
            }
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                // El exceso no se celebra: se avisa en rojo (el mismo tono
                // de error que usa el resto de la app) — solo en un tope de
                // gasto. El verde queda para una meta alcanzada (ahorro o
                // ingreso esperado).
                excedeGasto
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
            {` ${verbo} de `}
            <span className="font-mono tabular-nums">
              {textoMonto(renglon.target, renglon.currency)}
            </span>
          </p>
          {excedeGasto && (
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
