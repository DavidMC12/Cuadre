"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { FalloConsulta, estadoDeConsulta, mensajeDeCargaFallida, mensajeDeFallo, mensajeSinConexion } from "@/components/fallo-consulta";
import { ConfirmarEntrar } from "@/components/admin/confirmar-entrar";
import { EmptyState } from "@/components/empty-state";
import { Seccion } from "@/components/ajustes/seccion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import {
  useRegistroDeSuplantaciones,
  useSuplantar,
  useUsuariosDelSistema,
  type UsuarioDelSistema,
} from "@/hooks/use-admin";
import { usePerfil } from "@/hooks/use-perfil";
import { etiquetaFecha, etiquetaMesDeFecha, horaCorta } from "@/lib/fecha";

export default function PaginaAdmin() {
  const router = useRouter();
  // La persona cuya cuenta se pidió abrir: vive aquí porque la decisión la
  // toma la página, no la lista. Hasta confirmar en el diálogo no corre nada.
  const [personaAEntrar, setPersonaAEntrar] = useState<UsuarioDelSistema | null>(null);
  const {
    data: perfil,
    isPending: cargandoPerfil,
    isPaused: perfilPausado,
    refetch: recargarPerfil,
  } = usePerfil();
  const puedeAdministrar = perfil?.isAdmin ?? false;

  const {
    data: personas,
    isPending,
    isError,
    error,
    isPaused,
    isFetching,
    refetch: recargarPersonas,
  } = useUsuariosDelSistema(puedeAdministrar);
  // El registro de suplantaciones es el libro de auditoría: si falla o queda
  // pausado sin red, NO desaparece en silencio como si no hubiera entradas —
  // se dice con el mismo bloque de fallo del resto de la pantalla.
  const {
    data: registro,
    isError: registroIsError,
    error: registroError,
    isPending: registroCargando,
    isPaused: registroPausado,
    isFetching: registroRefrescando,
    refetch: recargarRegistro,
  } = useRegistroDeSuplantaciones(puedeAdministrar);
  const suplantar = useSuplantar();

  // Perder la red mientras se busca el perfil no puede dejar el esqueleto
  // eterno: sin saber si administra, se dice "sin conexión" y se ofrece
  // reintentar.
  const pausadaPerfil = !perfil && perfilPausado === true;
  const estadoPersonas = estadoDeConsulta({
    data: personas,
    isError,
    isPaused,
    isLoading: isPending,
  });
  const pausadaPersonas = estadoPersonas === "pausada";
  const estadoRegistro = estadoDeConsulta({
    data: registro,
    isError: registroIsError,
    isPaused: registroPausado,
    isLoading: registroCargando,
  });

  // La suplantación SOLO corre desde la confirmación: el botón "Entrar" de la
  // lista apenas la pide.
  function entrarComo(persona: UsuarioDelSistema) {
    suplantar.mutate(
      { id: persona.id, email: persona.email },
      {
        onSuccess: () => {
          setPersonaAEntrar(null);
          toast.success(`Ahora estás viendo la cuenta de ${persona.email}.`);
          router.push("/");
          router.refresh();
        },
        onError: () => toast.error("No se pudo entrar a esa cuenta."),
      }
    );
  }

  if (cargandoPerfil && !pausadaPerfil) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Administración</h1>
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (pausadaPerfil) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Administración</h1>
        <FalloConsulta
          mensaje={mensajeSinConexion("tu perfil")}
          onReintentar={() => recargarPerfil()}
        />
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
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => router.push("/ajustes")}>
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

      {isPending && !pausadaPersonas && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      )}

      {/* La consulta no se pudo leer y no hay nada que mostrar: se dice y se
          ofrece reintentar, con el mismo bloque de fallo que el resto de la
          app. Con datos viejos en la memoria el listado se sigue mostrando:
          el error no borra lo que ya está en el libro. La regla la decide
          `estadoPersonas`; no se repite a mano con `isError && !personas`. */}
      {estadoPersonas === "fallo" && (
        <FalloConsulta
          mensaje={mensajeDeFallo(error, mensajeDeCargaFallida("la lista de personas"))}
          reintento={isFetching}
          // Dos fallos pueden convivir en esta pantalla (el registro también
          // avisa): botones idénticos no se distinguen de oído ni de mano.
          etiquetaBoton="Reintentar personas"
          onReintentar={() => recargarPersonas()}
        />
      )}

      {pausadaPersonas && (
        <FalloConsulta
          mensaje={mensajeSinConexion("la lista de personas")}
          etiquetaBoton="Reintentar personas"
          onReintentar={() => recargarPersonas()}
        />
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
                    {/* El hook junta varios roles en un texto ("admin, user"). */}
                    {persona.role?.split(",").some((parte) => parte.trim() === "admin") && (
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
                    className="min-h-11 shrink-0"
                    onClick={() => setPersonaAEntrar(persona)}
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

      {estadoRegistro === "cargando" && (
        <Skeleton className="h-16 w-full rounded-lg" />
      )}

      {/* El registro no sirve de nada si hay que abrir la base para leerlo:
          existe justamente para poder responderle a alguien que pregunte
          quién entró a sus cuentas. Con datos viejos en la memoria el
          registro se sigue mostrando; el error no borra lo que ya está en el
          libro — y sin datos, un fallo no se disfraza de "no has entrado a
          ninguna". Cargado y vacío tampoco se queda mudo: una sección que
          no existe no se puede explicar. */}
      {registro && (
        <Seccion titulo="Cuentas a las que has entrado">
          {registro.length === 0 ? (
            // Sin el estado vacío grande ni ícono: una línea apagada que
            // dice en palabras que la sección todavía no tiene historial.
            <p className="px-3 py-2.5 text-xs text-muted-foreground">
              Todavía no has entrado a ninguna cuenta.
            </p>
          ) : (
            registro.map((entrada) => (
              <div key={entrada.id} className="flex flex-col px-3 py-2.5">
                <span className="truncate text-sm">{entrada.targetEmail}</span>
                <span className="text-xs text-muted-foreground">
                  {etiquetaFecha(entrada.startedAt)} a las {horaCorta(entrada.startedAt)}
                </span>
              </div>
            ))
          )}
        </Seccion>
      )}

      {estadoRegistro === "pausada" && (
        <FalloConsulta
          mensaje={mensajeSinConexion("el registro de entradas")}
          etiquetaBoton="Reintentar el registro de entradas"
          onReintentar={() => recargarRegistro()}
        />
      )}

      {estadoRegistro === "fallo" && (
        <FalloConsulta
          mensaje={mensajeDeFallo(registroError, mensajeDeCargaFallida("el registro de entradas"))}
          reintento={registroRefrescando}
          etiquetaBoton="Reintentar el registro de entradas"
          onReintentar={() => recargarRegistro()}
        />
      )}

      {/* El diálogo de confirmación vive al pie: abierto solo cuando hay
          alguien pedido, y ni la suplantación ni el registro corren de más
          mientras queda sin contestar. */}
      <ConfirmarEntrar
        persona={personaAEntrar}
        procesando={suplantar.isPending}
        onConfirmar={() => {
          if (personaAEntrar) entrarComo(personaAEntrar);
        }}
        onCancelar={() => setPersonaAEntrar(null)}
      />
    </div>
  );
}
