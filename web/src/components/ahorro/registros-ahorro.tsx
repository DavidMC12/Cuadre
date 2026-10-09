"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { RegistroDeAhorro } from "@/lib/api/types";
import { etiquetaFecha } from "@/lib/fecha";
import { textoDeRegistro } from "@/lib/ahorros";

/**
 * Las últimas anotaciones de ahorro de una cuenta, del más reciente al más
 * viejo.
 *
 * Cada registro es INMUTABLE: no hay editar ni borrar — la corrección es
 * anotar otro de signo contrario, igual que el ajuste de saldo. Si todavía
 * no hay nada, se dice sobrio: una cuenta de ahorro sin anotaciones no es un
 * error, es alguien que no ha empezado.
 */
export function RegistrosAhorro({
  registros,
  cargando,
}: {
  registros: RegistroDeAhorro[] | undefined;
  cargando: boolean;
}) {
  if (cargando) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-2/3 rounded-lg" />
        <Skeleton className="h-8 w-1/2 rounded-lg" />
      </div>
    );
  }

  const lista = registros ?? [];

  if (lista.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Aún no has anotado ahorro aquí.</p>
    );
  }

  return (
    <ul className="flex flex-col" aria-label="Últimos registros de ahorro">
      {lista.map((registro, indice) => {
        const texto = textoDeRegistro(registro);
        // Un cero no produce fila (no debería ocurrir, pero si llegara, la
        // lista no inventa palabras sobre nada).
        if (texto === null) return null;
        const descripcion = registro.description?.trim();
        return (
          <li
            key={registro.id}
            className={indice > 0 ? "border-t border-border py-2" : "py-2"}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm">{texto}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {etiquetaFecha(registro.occurredAt)}
              </span>
            </div>
            {descripcion && (
              <p className="text-xs text-muted-foreground">{descripcion}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
