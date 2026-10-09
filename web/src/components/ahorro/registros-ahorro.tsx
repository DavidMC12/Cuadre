"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { FalloConsulta } from "@/components/fallo-consulta";
import type { RegistroDeAhorro } from "@/lib/api/types";
import { etiquetaFecha } from "@/lib/fecha";
import { textoDeRegistro } from "@/lib/ahorros";

/**
 * Las últimas anotaciones de ahorro de una cuenta, del más reciente al más
 * viejo.
 *
 * Cada registro es INMUTABLE: no hay editar ni borrar — la corrección es
 * anotar otro de signo contrario, igual que el ajuste de saldo.
 *
 * Cada registro es INMUTABLE: no hay editar ni borrar — la corrección es
 * anotar otro de signo contrario, igual que el ajuste de saldo.
 *
 * "Sin registros" y "fallo de consulta" son cosas distintas: decir que no
 * anotaste nada cuando el servidor no contestó sería mentir en una pantalla
 * de dinero. Si la lista no se pudo leer, aquí se dice y se ofrece
 * reintentar; el vacío solo se declara cuando la lista sí se conoce.
 */
export function RegistrosAhorro({
  registros,
  cargando,
  fallo,
}: {
  registros: RegistroDeAhorro[] | undefined;
  cargando: boolean;
  /** Los datos no llegaron porque la consulta falló o quedó sin conexión:
   * mensaje y Reintentar, igual que el resto de bloques que consultan. */
  fallo?: { mensaje: string; reintento?: boolean; onReintentar: () => void } | null;
}) {
  if (fallo) {
    return (
      <FalloConsulta
        etiquetaBoton="Reintentar anotaciones"
        mensaje={fallo.mensaje}
        reintento={fallo.reintento}
        onReintentar={fallo.onReintentar}
      />
    );
  }

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
