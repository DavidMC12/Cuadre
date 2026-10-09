"use client";

import { CreditCard, Landmark, Wallet, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Monto } from "@/components/monto";
import { DetalleCuenta } from "@/components/cuentas/detalle-cuenta";
import { ETIQUETA_TIPO_CUENTA } from "@/lib/labels";
import type { Cuenta } from "@/lib/api/types";
import {
  estadoCupo,
  etiquetaSaldo,
  saldoAbsoluto,
  tonoBarraCupo,
} from "@/lib/detalle-de-cuenta";
import { aUnidadesMinimas, esCero, textoMonto } from "@/lib/money";
import { cn } from "@/lib/utils";

const ICONO_TIPO_CUENTA: Record<Cuenta["type"], LucideIcon> = {
  bank: Landmark,
  card: CreditCard,
  cash: Wallet,
};

/**
 * Una cuenta en la lista.
 *
 * Las cuentas que no son tarjeta se quedan como siempre: su saldo.
 *
 * Una tarjeta no es plata que tienes, así que no muestra un saldo negativo
 * grande: con cupo, la cifra principal es el disponible y debajo va la deuda
 * (o el cupo) con una barra fina de uso; sin cupo, dice "Debes"/"Sin deuda"/
 * "A favor" según su saldo. La barra nunca se apoya solo en el color: lleva
 * `role="progressbar"` con un nombre que dice las cifras.
 */
export function CuentaCard({ cuenta }: { cuenta: Cuenta }) {
  const Icono = ICONO_TIPO_CUENTA[cuenta.type];
  const esTarjeta = cuenta.type === "card";
  // Disponible, usado y porcentaje se derivan del cupo y del saldo; nunca se
  // piden ni se guardan.
  const estado = esTarjeta ? estadoCupo(cuenta.creditLimit, cuenta.balance) : null;
  const tieneDeuda = estado ? aUnidadesMinimas(estado.usado) > 0n : false;

  return (
    <DetalleCuenta cuenta={cuenta}>
      <button
        type="button"
        className="block w-full rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/85"
      >
        <Card className="transition-colors hover:bg-muted/50">
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <Icono className="size-5 text-muted-foreground" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{cuenta.name}</span>
                <span className="text-xs text-muted-foreground">
                  {ETIQUETA_TIPO_CUENTA[cuenta.type]} · {cuenta.currency}
                </span>
              </div>

              {estado && cuenta.creditLimit ? (
                /* El disponible es cupo libre, no plata que tengas: en tinta
                   apagada, como en el cajón, para no confundirlo con un saldo
                   verde de una cuenta. Sigue mostrando el menos si se pasó. */
                <div className="flex shrink-0 flex-col items-end">
                  <span className="text-xs text-muted-foreground">Disponible</span>
                  <Monto
                    valor={estado.disponible}
                    moneda={cuenta.currency}
                    signo="neutro"
                    className="text-base"
                  />
                </div>
              ) : esTarjeta ? (
                /* Sin cupo no hay disponible que mostrar: se dice la deuda (o
                   el saldo a favor) en palabras, no un saldo negativo grande
                   que se leería como plata que sale de tus cuentas. */
                <div className="flex shrink-0 flex-col items-end">
                  <span className="text-xs text-muted-foreground">{etiquetaSaldo(cuenta)}</span>
                  {!esCero(cuenta.balance) && (
                    <Monto
                      valor={saldoAbsoluto(cuenta)}
                      moneda={cuenta.currency}
                      signo="ninguno"
                      className="text-base"
                    />
                  )}
                </div>
              ) : (
                <Monto
                  valor={cuenta.balance}
                  moneda={cuenta.currency}
                  signo="negativo"
                  className="text-base"
                />
              )}
            </div>

            {estado && cuenta.creditLimit && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {tieneDeuda
                    ? `Debes ${textoMonto(estado.usado, cuenta.currency)}`
                    : `de ${textoMonto(cuenta.creditLimit, cuenta.currency)}`}
                </span>
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(estado.porcentaje)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Cupo de ${cuenta.name}: usado ${textoMonto(estado.usado, cuenta.currency)} de ${textoMonto(cuenta.creditLimit, cuenta.currency)}`}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width]",
                      tonoBarraCupo(estado.porcentaje)
                    )}
                    style={{ width: `${estado.porcentaje}%` }}
                  />
                </div>
              </div>
            )}

            {/* En una cuenta de ahorro va también lo APARTADO, corto y aparte
                del saldo: no es lo mismo, ni dice de dónde viene. Solo con
                algo anotado — el cero no se anuncia; y una cuenta que no es
                de ahorro ni la lleva, aunque el servidor le mande "0.0000". */}
            {cuenta.isSavings && !esCero(cuenta.saved) && (
              <span className="text-xs text-muted-foreground">
                Ahorrado {textoMonto(cuenta.saved, cuenta.currency)}
              </span>
            )}
          </CardContent>
        </Card>
      </button>
    </DetalleCuenta>
  );
}
