import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Monto } from "@/components/monto";
import type { Cuenta } from "@/lib/api/types";
import { sumarMontos } from "@/lib/money";

/**
 * "Ahorrado": lo que hay en las cuentas marcadas como de ahorro, en esta
 * moneda. A diferencia de "Tienes", no aparece si no hay ninguna cuenta
 * marcada: el ahorro es una decisión de quien usa la app, no un dato que se
 * le imponga.
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
  if (cargando) return <Skeleton className="h-[74px] w-full rounded-xl" />;

  const deAhorro = (cuentas ?? []).filter(
    (cuenta) => cuenta.isSavings && cuenta.currency === moneda
  );

  // Sin cuentas de ahorro en esta moneda no se muestra nada: ni la tarjeta ni
  // su lugar. Un hueco vacío sería peor que no estar.
  if (deAhorro.length === 0) return null;

  const total = sumarMontos(deAhorro.map((cuenta) => cuenta.balance));

  return (
    <Card>
      <CardContent className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Ahorrado</span>
        <Monto valor={total} moneda={moneda} signo="negativo" className="text-2xl" />
      </CardContent>
    </Card>
  );
}
