"use client";

import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useDejarDeSuplantar, useSuplantacionActiva } from "@/hooks/use-admin";
import { usePerfil } from "@/hooks/use-perfil";

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
  const { data: suplantadoPor } = useSuplantacionActiva();
  const { data: perfil } = usePerfil();
  const dejarDeSuplantar = useDejarDeSuplantar();

  if (!suplantadoPor) return null;

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
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2 px-4 py-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium">
          <Eye className="size-4 shrink-0" />
          <span className="truncate">
            Estás viendo la cuenta de {perfil?.email ?? "otra persona"}
          </span>
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
