"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Monto } from "@/components/monto";
import { FormularioAhorro } from "@/components/ahorro/formulario-ahorro";
import type { Cuenta } from "@/lib/api/types";
import { sumarMontos } from "@/lib/money";

/**
 * "Ahorrado": lo que esta persona HA DECIDIDO apartar para ahorro en esta
 * moneda — las transferencias que le pasaron a sus cuentas de ahorro, más lo
 * que anotó a mano. NO es el saldo de esas cuentas: la plata que ya vivía
 * ahí solo cuenta si alguien apartó.
 *
 * A diferencia de "Tienes", no aparece si no hay ninguna cuenta de ahorro
 * activa: el ahorro es una decisión de quien usa la app, no un dato que se
 * le imponga. Y con cuentas de ahorro pero cero apartado igual se muestra el
 * $0, porque la tarjeta trae el botón para empezar.
 */
export function TotalAhorrado({
  cuentas,
  moneda,
  cargando,
}: {
  cuentas: Cuenta[] | undefined;
  moneda: string;
  cargando: boolean;
}) {
  if (cargando) return <Skeleton className="h-28 w-full rounded-xl" />;

  const deAhorro = (cuentas ?? []).filter(
    (cuenta) =>
      cuenta.isSavings && cuenta.currency === moneda && !cuenta.archivedAt
  );

  // Sin cuentas de ahorro activas en esta moneda no se muestra nada: ni la
  // tarjeta ni su lugar. Un hueco vacío sería peor que no estar.
  if (deAhorro.length === 0) return null;

  // La suma es de `saved`, no de `balance`: el saldo ya está en "Tienes"
  // mezclarlo aquí diría dos veces lo mismo y mentiría sobre lo apartado.
  const total = sumarMontos(deAhorro.map((cuenta) => cuenta.saved));

  return (
    <Card>
      <CardContent className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Ahorrado</span>
        <Monto valor={total} moneda={moneda} signo="negativo" className="text-2xl" />
        <p className="text-xs text-muted-foreground">
          Lo que apartaste, no el saldo de tus cuentas.
        </p>
        <FormularioAhorro cuentas={deAhorro}>
          <Button
            type="button"
            variant="outline"
            className="mt-2 min-h-11 self-start"
          >
            Registrar ahorro
          </Button>
        </FormularioAhorro>
      </CardContent>
    </Card>
  );
}
