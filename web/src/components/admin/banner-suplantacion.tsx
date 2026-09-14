"use client";

import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useDejarDeSuplantar } from "@/hooks/use-admin";
import { usePerfil } from "@/hooks/use-perfil";
import { ANCHO_CONTENIDO } from "@/lib/layout";
import { cn } from "@/lib/utils";

/**
 * Aviso permanente de que lo que se ve en pantalla es la cuenta de otra
 * persona.
 *
 * No es decoración: sin esto, quien administra podría registrar un gasto
 * creyendo que es suyo y metérselo a alguien más en su historial. Y ese
 * historial no se edita —se corrige con otro movimiento—, así que el error
 * quedaría escrito para siempre en las cuentas de quien no tuvo nada que ver.
 * Por eso ocupa el ancho completo, va arriba de todo y no se puede cerrar.
 */
export function BannerSuplantacion() {
  const router = useRouter();
  const dejarDeSuplantar = useDejarDeSuplantar();

  // El aviso y el correo que muestra salen del MISMO dato. Con dos consultas
  // separadas podrían desincronizarse, y el aviso llegaría a decir "estás
  // viendo la cuenta de" seguido del correo de quien mira, no del de quien es
  // mirado — peor que no decir nada.
  const { data: perfil } = usePerfil();

  if (!perfil?.isImpersonated) return null;

  function volver() {
    dejarDeSuplantar.mutate(undefined, {
      onSuccess: () => {
        toast.success("Volviste a tu cuenta.");
        router.push("/admin");
        router.refresh();
      },
      onError: () => toast.error("No se pudo volver a tu cuenta. Cierra sesión y entra de nuevo."),
    });
  }

  return (
    <div className="sticky top-0 z-50 bg-destructive text-white">
      <div
        className={cn(
          "mx-auto flex w-full items-center justify-between gap-2 px-4 py-2 md:px-8",
          ANCHO_CONTENIDO
        )}
      >
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium">
          <Eye className="size-4 shrink-0" />
          {/* "Mirando" y no "viendo": desde aquí no se puede cambiar nada, y
              esa palabra lo dice sin necesidad de una frase aparte. */}
          <span className="truncate">Mirando la cuenta de {perfil.email}</span>
        </span>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={volver}
          disabled={dejarDeSuplantar.isPending}
          className="shrink-0"
        >
          {dejarDeSuplantar.isPending ? "Saliendo…" : "Volver"}
        </Button>
      </div>
    </div>
  );
}
