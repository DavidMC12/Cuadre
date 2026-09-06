"use client";

import { useState } from "react";
import { Plus, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/empty-state";
import { FormularioCategoria } from "@/components/categorias/formulario-categoria";
import { CategoriaItem } from "@/components/categorias/categoria-item";
import { useCategorias } from "@/hooks/use-categorias";

export default function PaginaCategorias() {
  const [verArchivadas, setVerArchivadas] = useState(false);
  const { data, isLoading } = useCategorias(verArchivadas);

  // `includeArchived=true` trae activas y archivadas juntas; para esta vista
  // solo interesan las archivadas, así que se filtra en el cliente.
  const categorias = verArchivadas ? (data ?? []).filter((c) => c.archivedAt !== null) : data ?? [];

  const gastos = categorias.filter((categoria) => categoria.kind === "expense");
  const ingresos = categorias.filter((categoria) => categoria.kind === "income");
  const hayCategorias = categorias.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Categorías</h1>
        {!verArchivadas && (
          <FormularioCategoria>
            <Button size="sm">
              <Plus data-icon="inline-start" />
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

      {!isLoading && !hayCategorias && (
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

      {!isLoading && hayCategorias && (
        <div className="flex flex-col gap-5">
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
