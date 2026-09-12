"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchImpersonations, registerImpersonation } from "@/lib/api/admin";
import { authClient } from "@/lib/auth/client";

export const clavesAdmin = {
  usuarios: () => ["admin", "usuarios"] as const,
  registro: () => ["admin", "registro"] as const,
};

/** Una persona del sistema, tal como la conoce el proveedor de identidad. */
export interface UsuarioDelSistema {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  banned: boolean;
  createdAt: string;
}

/**
 * La lista sale de Neon Auth, no de la base de Cuadre: quien manda sobre quién
 * puede entrar es el proveedor de identidad, y él ya comprueba por su cuenta
 * que quien pregunta sea administrador.
 */
export function useUsuariosDelSistema(activo: boolean) {
  return useQuery({
    enabled: activo,
    queryKey: clavesAdmin.usuarios(),
    queryFn: async (): Promise<UsuarioDelSistema[]> => {
      const respuesta = await authClient.admin.listUsers({ query: { limit: 200 } });
      if (respuesta.error) throw new Error("No se pudo traer la lista de personas.");

      return (respuesta.data?.users ?? []).map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name || null,
        // Better Auth admite varios roles a la vez; aquí se juntan en un texto.
        role: Array.isArray(u.role) ? u.role.join(", ") : (u.role ?? null),
        banned: Boolean(u.banned),
        createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
      }));
    },
  });
}

/**
 * Entra a la app como otra persona.
 *
 * El orden importa y no es negociable: PRIMERO queda el rastro en Cuadre y
 * solo DESPUÉS se cambia la sesión. Si se hiciera al revés, un fallo entre los
 * dos pasos dejaría a alguien dentro de una cuenta ajena sin que nada lo
 * registrara, que es exactamente lo que el registro existe para evitar.
 */
export function useSuplantar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (persona: { id: string; email: string }) => {
      await registerImpersonation({
        targetAuthSubject: persona.id,
        targetEmail: persona.email,
      });

      const respuesta = await authClient.admin.impersonateUser({ userId: persona.id });
      if (respuesta.error) throw new Error("No se pudo entrar como esa persona.");
    },
    onSuccess: () => {
      // Sin esto, TODO lo que hay en caché sigue siendo del administrador: los
      // saldos, los movimientos y —lo más grave— el perfil, que es de donde
      // sale el aviso de que estás viendo una cuenta ajena. La pantalla se
      // vería idéntica a siempre mientras cualquier cosa que escribas se va al
      // libro de otra persona, y ese libro no se edita.
      queryClient.clear();
    },
  });
}

export function useDejarDeSuplantar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const respuesta = await authClient.admin.stopImpersonating();
      if (respuesta.error) throw new Error("No se pudo volver a tu cuenta.");
    },
    onSuccess: () => {
      // Todo lo que hay en caché es de la otra persona.
      queryClient.clear();
    },
  });
}

export function useRegistroDeSuplantaciones(activo: boolean) {
  return useQuery({
    queryKey: clavesAdmin.registro(),
    queryFn: () => fetchImpersonations(50),
    select: (respuesta) => respuesta.data,
    enabled: activo,
  });
}
