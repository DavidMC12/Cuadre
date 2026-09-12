"use client";

import { ChevronRight } from "lucide-react";

import { BotonExportar } from "@/components/ajustes/boton-exportar";
import { EditarNombre } from "@/components/ajustes/editar-nombre";
import { OpcionGuardada } from "@/components/ajustes/opcion-guardada";
import { Fila, FilaEnlace, Seccion, ValorFijo } from "@/components/ajustes/seccion";
import { SelectorTema } from "@/components/ajustes/selector-tema";
import { BotonSalir } from "@/components/auth/boton-salir";
import { Skeleton } from "@/components/ui/skeleton";
import { usePerfil } from "@/hooks/use-perfil";
import { etiquetaMes } from "@/lib/fecha";
import type { PantallaDeInicio } from "@/lib/api/types";

/** "Automática" no es una moneda: es dejar que la app la deduzca de tus cuentas. */
const AUTOMATICA = "auto";

const MONEDAS = [
  { valor: AUTOMATICA, etiqueta: "Automática" },
  { valor: "COP", etiqueta: "COP" },
  { valor: "USD", etiqueta: "USD" },
] as const;

const PANTALLAS = [
  { valor: "resumen", etiqueta: "Resumen" },
  { valor: "cuentas", etiqueta: "Cuentas" },
  { valor: "movimientos", etiqueta: "Movimientos" },
] as const;

export default function PaginaAjustes() {
  const { data: perfil, isLoading } = usePerfil();

  return (
    <div className="flex flex-col gap-5 pb-4">
      <h1 className="text-xl font-semibold">Ajustes</h1>

      {isLoading && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      )}

      {perfil && (
        <>
          <Seccion titulo="Tu cuenta">
            <Fila etiqueta="Nombre">
              <EditarNombre nombreActual={perfil.displayName}>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
              <ValorFijo>{etiquetaMes(perfil.createdAt.slice(0, 7))}</ValorFijo>
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
              ayuda="La que se propone al registrar un movimiento."
              apilado
            >
              <OpcionGuardada
                valor={perfil.defaultCurrency ?? AUTOMATICA}
                opciones={MONEDAS}
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

          <BotonSalir />
        </>
      )}
    </div>
  );
}
