"use client";

import { toast } from "sonner";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useGuardarPerfil } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { CambiosDePerfil } from "@/lib/api/types";

interface Opcion {
  valor: string;
  etiqueta: string;
}

/**
 * Una preferencia que se guarda sola al tocarla, sin botón de guardar.
 *
 * Lo que se ve marcado siempre es lo que dice el servidor, nunca lo que se
 * acaba de tocar. Así, si el guardado falla, el control se queda donde estaba
 * en vez de mostrar una preferencia que nunca llegó a guardarse.
 */
export function OpcionGuardada({
  valor,
  opciones,
  aCambio,
}: {
  valor: string;
  opciones: readonly Opcion[];
  aCambio: (elegido: string) => CambiosDePerfil;
}) {
  const guardar = useGuardarPerfil();

  return (
    <ToggleGroup
      value={[valor]}
      onValueChange={(valores) => {
        const elegido = valores[0];
        if (!elegido || elegido === valor) return;

        guardar.mutate(aCambio(elegido), {
          onError: (fallo) => {
            toast.error(
              fallo instanceof ApiError
                ? fallo.message
                : "No se pudo guardar el cambio. Intenta de nuevo."
            );
          },
        });
      }}
      variant="outline"
      className="w-full"
      disabled={guardar.isPending}
    >
      {opciones.map((opcion) => (
        <ToggleGroupItem key={opcion.valor} value={opcion.valor} className="flex-1">
          {opcion.etiqueta}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
