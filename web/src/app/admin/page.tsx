"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Seccion } from "@/components/ajustes/seccion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSuplantar, useUsuariosDelSistema, type UsuarioDelSistema } from "@/hooks/use-admin";
import { usePerfil } from "@/hooks/use-perfil";
import { etiquetaMesDeFecha } from "@/lib/fecha";

export default function PaginaAdmin() {
  const router = useRouter();
  const { data: perfil, isPending: cargandoPerfil } = usePerfil();
  const puedeAdministrar = perfil?.isAdmin ?? false;

  const { data: personas, isPending, isError } = useUsuariosDelSistema();
  const suplantar = useSuplantar();

  function entrarComo(persona: UsuarioDelSistema) {
    suplantar.mutate(
      { id: persona.id, email: persona.email },
      {
        onSuccess: () => {
          toast.success(`Ahora estás viendo la cuenta de ${persona.email}.`);
          router.push("/");
          router.refresh();
        },
        onError: () => toast.error("No se pudo entrar a esa cuenta."),
      }
    );
  }

  if (cargandoPerfil) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Administración</h1>
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  // La puerta de verdad está en el servidor, que responde 403 a quien no
  // administra. Esto solo evita mostrar una pantalla que no va a funcionar.
  if (!puedeAdministrar) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Administración</h1>
        <EmptyState
          Icono={ShieldCheck}
          titulo="Esta parte no es para ti"
          descripcion="Solo quien administra el sistema puede entrar aquí."
        >
          <Button type="button" variant="outline" size="sm" onClick={() => router.push("/ajustes")}>
            Volver a Ajustes
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Administración</h1>
        <p className="text-xs text-muted-foreground">
          Al entrar a una cuenta ves lo mismo que su dueño: sus movimientos, sus saldos, todo. Cada
          vez que lo haces queda registrado.
        </p>
      </div>

      {isPending && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      )}

      {isError && (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No pudimos traer la lista de personas.
        </p>
      )}

      {personas && personas.length === 0 && (
        <EmptyState
          Icono={Users}
          titulo="No hay nadie registrado"
          descripcion="Cuando alguien cree su cuenta va a aparecer aquí."
        />
      )}

      {personas && personas.length > 0 && (
        <Seccion titulo={`Personas (${personas.length})`}>
          {personas.map((persona) => {
            const soyYo = persona.id === perfil?.id || persona.email === perfil?.email;

            return (
              <div key={persona.id} className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{persona.name ?? persona.email}</span>
                    {persona.role === "admin" && (
                      <Badge variant="secondary" className="shrink-0">
                        admin
                      </Badge>
                    )}
                    {persona.banned && (
                      <Badge variant="destructive" className="shrink-0">
                        suspendida
                      </Badge>
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{persona.email}</span>
                  {persona.createdAt && (
                    <span className="text-xs text-muted-foreground">
                      Desde {etiquetaMesDeFecha(persona.createdAt)}
                    </span>
                  )}
                </div>

                {soyYo ? (
                  <span className="shrink-0 text-xs text-muted-foreground">Tú</span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => entrarComo(persona)}
                    disabled={suplantar.isPending}
                  >
                    Entrar
                  </Button>
                )}
              </div>
            );
          })}
        </Seccion>
      )}
    </div>
  );
}
