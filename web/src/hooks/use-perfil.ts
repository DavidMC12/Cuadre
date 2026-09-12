"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchProfile, updateProfile } from "@/lib/api/profile";
import type { CambiosDePerfil } from "@/lib/api/types";
import { decidirInicio } from "@/lib/inicio";

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
    // Dos preferencias cambiadas casi a la vez son dos peticiones en paralelo,
    // y la que responda de último dejaría en caché una foto anterior. Pedir el
    // perfil de nuevo al final cierra ese hueco.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: clavesPerfil.todo() });
    },
  });
}

/**
 * Vive fuera del hook para que dure lo que dura la pestaña abierta, no lo que
 * dura un componente montado: abrir la app pasa una sola vez, y volver al
 * resumen desde el menú no es abrirla.
 */
let yaSeAbrioLaApp = false;

/**
 * Manda a la pantalla que la persona eligió para abrir la app.
 *
 * Devuelve `true` mientras no se sepa a dónde hay que ir o mientras se está
 * yendo, para que quien lo llame no alcance a pintar una pantalla que está a
 * punto de reemplazarse.
 */
export function useIrAPantallaDeInicio(): boolean {
  const router = useRouter();
  const { data: perfil, isPending } = usePerfil();

  const decision = decidirInicio({
    yaSeAbrio: yaSeAbrioLaApp,
    buscandoPerfil: isPending,
    pantalla: perfil?.startPage,
  });

  // Se sacan a variables sueltas para que el efecto dependa de valores y no de
  // un objeto recién creado, que lo haría correr en cada renderizado.
  const { accion } = decision;
  const aDonde = decision.accion === "irse" ? decision.pantalla : null;

  useEffect(() => {
    if (accion === "esperar") return;

    // Se gasta el momento de abrir la app aunque no haya a dónde ir: si no, un
    // perfil que llegue tarde movería a la persona de pantalla en plena sesión.
    yaSeAbrioLaApp = true;
    if (aDonde) router.replace(`/${aDonde}`);
  }, [accion, aDonde, router]);

  return accion !== "quedarse";
}
