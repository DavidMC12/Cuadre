import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Monto } from "@/components/monto";
import type { Cuenta } from "@/lib/api/types";
import { sumarMontos } from "@/lib/money";

/**
 * "Tienes": el total de todas tus cuentas activas en esta moneda, sumadas de
 * verdad y no derivadas del mes. Va arriba del resumen porque es la pregunta
 * que el resumen tenía sin responder: cuánta plata hay, no solo cuánto se
 * movió este mes.
 */
export function TotalCuentas({
  cuentas,
  moneda,
  cargando,
}: {
  cuentas: Cuenta[] | undefined;
  moneda: string;
  cargando: boolean;
}) {
  if (cargando) return <Skeleton className="h-[74px] w-full rounded-xl" />;

  const total = sumarMontos(
    (cuentas ?? []).filter((cuenta) => cuenta.currency === moneda).map((cuenta) => cuenta.balance)
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Tienes</span>
        <Monto valor={total} moneda={moneda} signo="negativo" className="text-2xl" />
      </CardContent>
    </Card>
  );
}
