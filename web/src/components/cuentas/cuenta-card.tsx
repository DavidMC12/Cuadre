"use client";

import { CreditCard, Landmark, Wallet, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Monto } from "@/components/monto";
import { DetalleCuenta } from "@/components/cuentas/detalle-cuenta";
import { ETIQUETA_TIPO_CUENTA } from "@/lib/labels";
import type { Cuenta } from "@/lib/api/types";

const ICONO_TIPO_CUENTA: Record<Cuenta["type"], LucideIcon> = {
  bank: Landmark,
  card: CreditCard,
  cash: Wallet,
};

export function CuentaCard({ cuenta }: { cuenta: Cuenta }) {
  const Icono = ICONO_TIPO_CUENTA[cuenta.type];

  return (
    <DetalleCuenta cuenta={cuenta}>
      <button
        type="button"
        className="block w-full rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/85"
      >
        <Card className="transition-colors hover:bg-muted/50">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icono className="size-5 text-muted-foreground" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{cuenta.name}</span>
              <span className="text-xs text-muted-foreground">
                {ETIQUETA_TIPO_CUENTA[cuenta.type]} · {cuenta.currency}
              </span>
            </div>
            <Monto
              valor={cuenta.balance}
              moneda={cuenta.currency}
              signo="negativo"
              className="text-base"
            />
          </CardContent>
        </Card>
      </button>
    </DetalleCuenta>
  );
}
