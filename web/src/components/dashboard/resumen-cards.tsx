import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Monto } from "@/components/monto";
import type { ResumenMes } from "@/lib/api/types";

export function ResumenCards({
  resumen,
  moneda,
  cargando,
}: {
  resumen: ResumenMes | undefined;
  moneda: string;
  cargando: boolean;
}) {
  // En el celular: ingresos y gastos lado a lado, y el balance debajo a lo
  // ancho. Desde `md` los tres caben en una fila.
  if (cargando) {
    return (
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="col-span-2 h-20 rounded-xl lg:col-span-1 lg:h-16" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
      <Card size="sm">
        <CardContent className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Ingresos</span>
          {/* Con signo "+" a propósito: se ve igual que un ingreso en la lista de movimientos. */}
          <Monto valor={resumen?.income ?? "0"} moneda={moneda} className="text-base" />
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Gastos</span>
          {/* `expense` llega positivo del backend; se antepone el signo para que
                se vea igual que un gasto en la lista de movimientos. */}
          <Monto valor={`-${resumen?.expense ?? "0"}`} moneda={moneda} className="text-base" />
        </CardContent>
      </Card>
      {/* Tres en fila solo desde `lg`: en tablet cada tarjeta quedaría de ~130px
          y un balance de millones se cortaría sin avisar. Del mismo tamaño que
          Ingresos y Gastos, no más grande: "Tienes" es ahora el protagonista,
          esto es un dato secundario del mes. */}
      <Card size="sm" className="col-span-2 lg:col-span-1">
        <CardContent className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Balance del mes</span>
          <Monto valor={resumen?.net ?? "0"} moneda={moneda} className="text-base" />
        </CardContent>
      </Card>
    </div>
  );
}
