"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchProfile, updateProfile } from "@/lib/api/profile";
import type { CambiosDePerfil } from "@/lib/api/types";

export const clavesPerfil = {
  todo: () => ["perfil"] as const,
};

export function usePerfil() {
  return useQuery({
    queryKey: clavesPerfil.todo(),
    queryFn: fetchProfile,
    select: (respuesta) => respuesta.data,
  });
}

/**
 * Guarda el perfil y deja en caché lo que respondió el servidor, que es la
 * verdad. Si se guardara lo que se mandó, un campo que el servidor recorta o
 * normaliza quedaría en pantalla distinto a como quedó en la base.
 */
export function useGuardarPerfil() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cambios: CambiosDePerfil) => updateProfile(cambios),
    onSuccess: (respuesta) => {
      queryClient.setQueryData(clavesPerfil.todo(), respuesta);
    },
  });
}

/**
 * Vive fuera del hook para que dure lo que dura la pestaña abierta, no lo que
 * dura un componente montado. Esa es justamente la diferencia entre "abrir la
 * app" y "volver al resumen desde el menú": lo primero pasa una sola vez, y si
 * el segundo también redirigiera, quien eligiera otra pantalla de inicio nunca
 * podría volver a ver el resumen.
 */
let yaSeFueAlInicioElegido = false;

/**
 * Manda a la pantalla que la persona eligió para abrir la app.
 *
 * Devuelve `true` mientras no se sepa a dónde hay que ir o mientras se está
 * yendo, para que quien lo llame no alcance a pintar una pantalla que está a
 * punto de reemplazarse.
 */
export function useIrAPantallaDeInicio(): boolean {
  const router = useRouter();
  const { data: perfil, isLoading } = usePerfil();

  const seVa = !yaSeFueAlInicioElegido && perfil !== undefined && perfil.startPage !== "resumen";

  useEffect(() => {
    if (yaSeFueAlInicioElegido || !perfil) return;

    yaSeFueAlInicioElegido = true;
    if (perfil.startPage !== "resumen") router.replace(`/${perfil.startPage}`);
  }, [perfil, router]);

  return isLoading || seVa;
}
