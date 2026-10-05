"use client";

import { ChevronRight } from "lucide-react";

import { BotonExportar } from "@/components/ajustes/boton-exportar";
import { FalloConsulta, estadoDeConsulta, mensajeDeCargaFallida, mensajeDeFallo, mensajeSinConexion } from "@/components/fallo-consulta";
import { EditarNombre } from "@/components/ajustes/editar-nombre";
import { OpcionGuardada } from "@/components/ajustes/opcion-guardada";
import { Fila, FilaEnlace, Seccion, ValorFijo } from "@/components/ajustes/seccion";
import { SelectorTema } from "@/components/ajustes/selector-tema";
import { BotonSalir } from "@/components/auth/boton-salir";
import { Skeleton } from "@/components/ui/skeleton";
import { usePerfil } from "@/hooks/use-perfil";
import { etiquetaMesDeFecha } from "@/lib/fecha";
import { MONEDAS } from "@/lib/labels";
import type { PantallaDeInicio } from "@/lib/api/types";

/** "Automática" no es una moneda: es dejar que la app la deduzca de tus cuentas. */
const AUTOMATICA = "auto";

/**
 * La lista incluye la moneda que ya está guardada aunque no sea de las que las
 * pantallas ofrecen —la API acepta cualquier código de tres letras—. Si no,
 * quien tuviera una moneda rara vería los tres botones apagados y no sabría
 * qué tiene puesto.
 */
function opcionesDeMoneda(guardada: string | null) {
  const codigos: string[] = [...MONEDAS];
  if (guardada && !codigos.includes(guardada)) codigos.push(guardada);

  return [
    { valor: AUTOMATICA, etiqueta: "Automática" },
    ...codigos.map((codigo) => ({ valor: codigo, etiqueta: codigo })),
  ];
}

const PANTALLAS = [
  { valor: "resumen", etiqueta: "Resumen" },
  { valor: "cuentas", etiqueta: "Cuentas" },
  { valor: "movimientos", etiqueta: "Movimientos" },
] as const;

export default function PaginaAjustes() {
  const { data: perfil, isPending, isError, error, isFetching, isPaused, refetch } = usePerfil();

  // La misma política del resto: sin datos y sin red se dice "sin conexión",
  // no se deja el esqueleto eterno ni se pinta una pantalla vacía.
  const estado = estadoDeConsulta({ data: perfil, isError, isPaused, isLoading: isPending });
  const pausada = estado === "pausada";

  return (
    <div className="flex flex-col gap-5 pb-4">
      <h1 className="text-xl font-semibold">Ajustes</h1>

      {isPending && !pausada && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      )}

      {/* El mismo bloque de fallo que el resto de la app: la respuesta a "no
          se pudo cargar" es una sola, no una por pantalla. Con datos viejos
          en la memoria —un refetch en fondo que falló— la pantalla se queda
          con lo que dice el servidor: el error no borra lo que ya está. */}
      {isError && !perfil && (
        <FalloConsulta
          mensaje={mensajeDeFallo(error, mensajeDeCargaFallida("tus ajustes"))}
          reintento={isFetching}
          onReintentar={() => refetch()}
        />
      )}

      {pausada && (
        <FalloConsulta
          mensaje={mensajeSinConexion("tus ajustes")}
          onReintentar={() => refetch()}
        />
      )}

      {perfil && (
        <>
          <Seccion titulo="Tu cuenta">
            <Fila etiqueta="Nombre">
              <EditarNombre nombreActual={perfil.displayName}>
                <button
                  type="button"
                  className="flex min-h-11 min-w-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="truncate">{perfil.displayName}</span>
                  <ChevronRight className="size-4 shrink-0" />
                </button>
              </EditarNombre>
            </Fila>

            {/* Sin flecha, a diferencia del nombre: eso ya dice que no se toca,
                y una nota explicándolo solo le robaba ancho al correo. */}
            <Fila etiqueta="Correo">
              <ValorFijo>{perfil.email}</ValorFijo>
            </Fila>

            <Fila etiqueta="Usas Cuadre desde">
              <ValorFijo>{etiquetaMesDeFecha(perfil.createdAt)}</ValorFijo>
            </Fila>
          </Seccion>

          <Seccion titulo="Tu dinero">
            <FilaEnlace
              etiqueta="Categorías"
              ayuda="Crear, renombrar y archivar"
              href="/categorias"
            />

            <Fila
              etiqueta="Moneda por defecto"
              ayuda="La que viene marcada al crear una cuenta."
              apilado
            >
              <OpcionGuardada
                valor={perfil.defaultCurrency ?? AUTOMATICA}
                opciones={opcionesDeMoneda(perfil.defaultCurrency)}
                aCambio={(elegido) => ({
                  defaultCurrency: elegido === AUTOMATICA ? null : elegido,
                })}
              />
            </Fila>
          </Seccion>

          <Seccion titulo="La app">
            <Fila etiqueta="Tema" ayuda="Se queda en este aparato." apilado>
              <SelectorTema />
            </Fila>

            <Fila etiqueta="Al abrir" ayuda="La pantalla con la que arranca la app." apilado>
              <OpcionGuardada
                valor={perfil.startPage}
                opciones={PANTALLAS}
                aCambio={(elegido) => ({ startPage: elegido as PantallaDeInicio })}
              />
            </Fila>
          </Seccion>

          <Seccion titulo="Respaldo">
            <Fila
              etiqueta="Tus movimientos en un archivo"
              ayuda="Todo el historial, para abrirlo en Excel o guardarlo aparte."
              apilado
            >
              <BotonExportar />
            </Fila>
          </Seccion>

          {perfil.isAdmin && (
            <Seccion titulo="Administración">
              <FilaEnlace
                etiqueta="Personas"
                ayuda="Ver quién usa Cuadre y entrar a su cuenta"
                href="/admin"
              />
            </Seccion>
          )}
        </>
      )}

      {/* Fuera del bloque de arriba a propósito: salir no necesita el perfil, y
          si desapareciera cuando algo falla, esta pantalla —que es la única
          que lleva el botón— dejaría a la persona sin forma de cerrar sesión. */}
      <BotonSalir />
    </div>
  );
}
