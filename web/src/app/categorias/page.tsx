"use client";

import { useState } from "react";
import { Plus, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/empty-state";
import { FalloConsulta, mensajeDeFallo } from "@/components/fallo-consulta";
import { FormularioCategoria } from "@/components/categorias/formulario-categoria";
import { CategoriaItem } from "@/components/categorias/categoria-item";
import { useCategorias } from "@/hooks/use-categorias";

export default function PaginaCategorias() {
  const [verArchivadas, setVerArchivadas] = useState(false);
  const { data, isLoading, isError, error, isFetching, refetch } = useCategorias(verArchivadas);

  // Un fallo no es "no tienes categorías": `hayCategorias` sale de `data ?? []`,
  // así que sin esto el error se dibujaba como el vacío. Con datos viejos en
  // memoria (un refetch fallido) se siguen mostrando.
  const fallo = isError && !data;

  // `includeArchived=true` trae activas y archivadas juntas; para esta vista
  // solo interesan las archivadas, así que se filtra en el cliente.
  const categorias = verArchivadas
    ? (data ?? []).filter((c) => c.archivedAt !== null)
    : (data ?? []);

  const gastos = categorias.filter((categoria) => categoria.kind === "expense");
  const ingresos = categorias.filter((categoria) => categoria.kind === "income");
  const hayCategorias = categorias.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Categorías</h1>
        {!verArchivadas && (
          <FormularioCategoria>
            {/* Sin `data-icon`: esa marca angosta el relleno del lado del
                ícono, y acá compite con `px-4` dejando el botón dispar. */}
            <Button size="sm" className="h-10 gap-1.5 px-4">
              <Plus />
              Nueva
            </Button>
          </FormularioCategoria>
        )}
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      )}

      {/* La consulta no se pudo leer y no hay nada que mostrar: se dice y se
          ofrece reintentar. Sin esto, "No pudimos cargar" se veía como
          "Todavía no tienes categorías", una afirmación falsa. */}
      {fallo && (
        <FalloConsulta
          etiquetaBoton="Reintentar categorías"
          mensaje={mensajeDeFallo(
            error,
            "No pudimos cargar tus categorías. Puede ser que el servidor esté dormido."
          )}
          reintento={isFetching}
          onReintentar={() => refetch()}
        />
      )}

      {!isLoading && !fallo && !hayCategorias && (
        <EmptyState
          Icono={Tag}
          titulo={verArchivadas ? "No hay categorías archivadas" : "Todavía no tienes categorías"}
          descripcion={
            verArchivadas
              ? "Las que archives van a aparecer aquí."
              : "Crea la primera para clasificar tus gastos e ingresos."
          }
        >
          {!verArchivadas && (
            <FormularioCategoria>
              <Button size="sm" className="mt-1">
                <Plus data-icon="inline-start" />
                Crear categoría
              </Button>
            </FormularioCategoria>
          )}
        </EmptyState>
      )}

      {!isLoading && !fallo && hayCategorias && (
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 md:gap-8">
          {gastos.length > 0 && (
            <section className="flex flex-col gap-1">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Gastos
              </h2>
              <div className="flex flex-col divide-y divide-border">
                {gastos.map((categoria) => (
                  <CategoriaItem key={categoria.id} categoria={categoria} />
                ))}
              </div>
            </section>
          )}

          {ingresos.length > 0 && (
            <section className="flex flex-col gap-1">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Ingresos
              </h2>
              <div className="flex flex-col divide-y divide-border">
                {ingresos.map((categoria) => (
                  <CategoriaItem key={categoria.id} categoria={categoria} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Separator />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-center text-muted-foreground"
        onClick={() => setVerArchivadas((valor) => !valor)}
      >
        {verArchivadas ? "Ver categorías activas" : "Ver categorías archivadas"}
      </Button>
    </div>
  );
}
