"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategorias } from "@/hooks/use-categorias";
import { usePorCategoria } from "@/hooks/use-reportes";
import type { TipoCategoria } from "@/lib/api/types";
import { textoMonto } from "@/lib/money";
import { mapaColoresCategorias, COLOR_NEUTRO } from "@/lib/chart-colors";
import { SIN_CATEGORIA } from "@/lib/labels";

const CAPACIDAD = 7;

interface FilaGrafica {
  id: string;
  nombre: string;
  /** El texto exacto, para la etiqueta. */
  total: string;
  /** Solo para el largo de la barra: nunca se usa este valor para ninguna
   * cuenta de dinero, ni se guarda en ningún lado. */
  valorNumerico: number;
  color: string;
}

/**
 * Barras hechas a mano en vez de con Recharts: en una pantalla angosta de
 * celular, una barra horizontal con la etiqueta del monto AL LADO (no
 * encima) nunca se recorta, porque es texto normal y no un elemento de SVG
 * al que hay que calcularle el espacio de antemano.
 */
export function GraficaPorCategoria({
  mes,
  moneda,
  tipo,
  onCambiarTipo,
}: {
  mes: string;
  moneda: string;
  tipo: TipoCategoria;
  onCambiarTipo: (tipo: TipoCategoria) => void;
}) {
  // Con archivadas incluidas: un movimiento viejo puede apuntar a una
  // categoría que hoy ya está archivada, y necesita el mismo color de
  // siempre para que no "salte" de un mes a otro.
  const { data: catalogoCompleto } = useCategorias(true);
  const { data: porCategoria, isLoading } = usePorCategoria({ month: mes, currency: moneda, kind: tipo });

  const catalogoDelTipo = (catalogoCompleto ?? [])
    .filter((categoria) => categoria.kind === tipo)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const colorPorCategoria = mapaColoresCategorias(catalogoDelTipo);

  const filas = porCategoria ?? [];
  // "Sin categoría" nunca se repliega dentro de "Otros": son cosas distintas
  // (una es de verdad una categoría que no cupo, la otra es "no elegiste
  // ninguna") y mezclarlas confundiría más de lo que simplifica.
  const filaSinCategoria = filas.find((fila) => fila.categoryId === null);
  const filasConCategoria = filas.filter((fila) => fila.categoryId !== null);

  const visibles = filasConCategoria.length > CAPACIDAD ? filasConCategoria.slice(0, CAPACIDAD) : filasConCategoria;
  const resto = filasConCategoria.length > CAPACIDAD ? filasConCategoria.slice(CAPACIDAD) : [];

  const datos: FilaGrafica[] = visibles.map((fila) => ({
    id: fila.categoryId!,
    nombre: fila.categoryName!,
    total: fila.total,
    valorNumerico: Number(fila.total),
    color: colorPorCategoria.get(fila.categoryId!) ?? COLOR_NEUTRO.claro,
  }));

  if (filaSinCategoria) {
    datos.push({
      id: "sin-categoria",
      nombre: SIN_CATEGORIA,
      total: filaSinCategoria.total,
      valorNumerico: Number(filaSinCategoria.total),
      color: COLOR_NEUTRO.claro,
    });
  }

  if (resto.length > 0) {
    // Suma solo para esta fila de repliegue: no participa en ningún saldo ni
    // se guarda en ningún lado, así que perder algo de precisión aquí no
    // descuadra nada.
    const totalResto = resto.reduce((acumulado, fila) => acumulado + Number(fila.total), 0);
    datos.push({
      id: "otros",
      nombre: "Otros",
      total: String(totalResto),
      valorNumerico: totalResto,
      color: COLOR_NEUTRO.claro,
    });
  }

  const valorMaximo = Math.max(1, ...datos.map((fila) => fila.valorNumerico));

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        value={[tipo]}
        onValueChange={(valores) => {
          if (valores.length > 0) onCambiarTipo(valores[0] as TipoCategoria);
        }}
        variant="outline"
        className="w-full"
      >
        <ToggleGroupItem value="expense" className="flex-1">
          Gastos
        </ToggleGroupItem>
        <ToggleGroupItem value="income" className="flex-1">
          Ingresos
        </ToggleGroupItem>
      </ToggleGroup>

      {isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-full rounded-full" />
          <Skeleton className="h-5 w-full rounded-full" />
          <Skeleton className="h-5 w-full rounded-full" />
        </div>
      )}

      {!isLoading && datos.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {tipo === "expense" ? "Sin gastos este mes." : "Sin ingresos este mes."}
        </p>
      )}

      {!isLoading && datos.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {datos.map((fila) => {
            const porcentaje = Math.max((fila.valorNumerico / valorMaximo) * 100, 4);
            return (
              <div key={fila.id} className="flex items-center gap-2">
                <span className="w-20 shrink-0 truncate text-xs text-muted-foreground" title={fila.nombre}>
                  {fila.nombre}
                </span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${porcentaje}%`, backgroundColor: fila.color }}
                  />
                </div>
                <span className="shrink-0 text-right text-xs tabular-nums whitespace-nowrap">
                  {textoMonto(fila.total, moneda)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
