"use client";

import { useId, useState } from "react";
import { toast } from "sonner";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Monto } from "@/components/monto";
import { useMarcarAhorro } from "@/hooks/use-cuentas";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { Cuenta } from "@/lib/api/types";
import { AYUDA_CUENTA_AHORRO, ETIQUETA_TIPO_CUENTA } from "@/lib/labels";

/**
 * Lo de una cuenta, un toque adentro de la lista: sus datos y la única cosa
 * que se puede cambiar aquí, que es si cuenta como ahorro. Abre como cajón
 * inferior, igual que el detalle de un movimiento.
 *
 * El interruptor escribe al instante, sin botón de guardar: marcar una cuenta
 * como de ahorro no rompe nada y se deshace con otro toque, igual que
 * archivar. Desde la cuenta de otra persona se ve, pero no se toca.
 */
export function DetalleCuenta({ cuenta, children }: { cuenta: Cuenta; children: React.ReactNode }) {
  const soloMirar = useSoloMirar();
  const marcarAhorro = useMarcarAhorro();
  const [abierto, setAbierto] = useState(false);
  // Cada tarjeta monta su propio detalle, así que el id del interruptor no
  // puede ser fijo: varios a la vez harían que la etiqueta apunte al de otra
  // cuenta.
  const idAhorro = useId();

  function cambiarAhorro(valor: boolean) {
    marcarAhorro.mutate(
      { id: cuenta.id, isSavings: valor },
      {
        onError: (error) => {
          if (error instanceof ApiError) {
            toast.error(error.message);
          } else {
            toast.error("No se pudo cambiar el ahorro. Intenta de nuevo.");
          }
        },
      }
    );
  }

  return (
    <Drawer open={abierto} onOpenChange={setAbierto}>
      <DrawerTrigger render={children as React.ReactElement} />
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{cuenta.name}</DrawerTitle>
          <DrawerDescription>
            {ETIQUETA_TIPO_CUENTA[cuenta.type]} · {cuenta.currency}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col items-center gap-0.5 py-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Saldo</span>
            <Monto
              valor={cuenta.balance}
              moneda={cuenta.currency}
              signo="negativo"
              className="text-2xl"
            />
          </div>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={idAhorro}>Cuenta de ahorro</Label>
              <Switch
                id={idAhorro}
                checked={cuenta.isSavings}
                disabled={soloMirar || marcarAhorro.isPending}
                onCheckedChange={cambiarAhorro}
              />
            </div>
            <p className="text-xs text-muted-foreground">{AYUDA_CUENTA_AHORRO}</p>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
