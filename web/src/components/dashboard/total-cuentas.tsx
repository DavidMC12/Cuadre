import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Monto } from "@/components/monto";
import type { Cuenta } from "@/lib/api/types";
import { etiquetaMes } from "@/lib/fecha";
import { deudaEnTarjetas, totalDeTienes } from "@/lib/detalle-de-cuenta";
import { aUnidadesMinimas, textoMonto } from "@/lib/money";

/**
 * "Tienes": el total de tus cuentas activas en esta moneda, sumadas de
 * verdad y no derivadas del mes. Va arriba del resumen porque es la pregunta
 * que el resumen tenía sin responder: cuánta plata hay, no solo cuánto se
 * movió este mes.
 *
 * Las tarjetas NO entran aquí: no es plata que tienes. Debajo, un renglón
 * discreto dice cuánto debes en ellas (solo lo que se debe, nunca un saldo a
 * favor que reste), y solo aparece si de verdad hay deuda.
 *
 * Con `mesDeCierre` ("YYYY-MM"), la lista que llega está cortada al cierre de
 * ese mes y la tarjeta cambia de tiempo verbal: ya no es "Tienes" sino
 * "Tenías al cierre de..." — el saldo de hoy no debe colarse como si fuera el
 * del mes que se está mirando.
 */
export function TotalCuentas({
  cuentas,
  moneda,
  cargando,
  mesDeCierre,
}: {
  cuentas: Cuenta[] | undefined;
  moneda: string;
  cargando: boolean;
  /** Definido solo cuando se mira un mes pasado: la tarjeta habla del cierre. */
  mesDeCierre?: string;
}) {
  if (cargando) return <Skeleton className="h-[74px] w-full rounded-xl" />;

  const total = totalDeTienes(cuentas ?? [], moneda);
  // La deuda de las tarjetas activas de esta moneda. Sin tarjetas, o con
  // tarjetas que no deben nada, no se pinta: un "Debes $0" sería ruido.
  const deuda = deudaEnTarjetas(cuentas ?? [], moneda);
  const hayDeuda = aUnidadesMinimas(deuda) > 0n;

  return (
    <Card>
      <CardContent className="flex flex-col gap-0.5">
        {/* La etiqueta larga parte en dos líneas sola (el contenedor deja
            crecer el alto) y no rompe el piso táctil: nada de lo que hay aquí
            abajo es un botón. */}
        <span className="text-xs text-muted-foreground uppercase tracking-wide">
          {mesDeCierre ? `Tenías al cierre de ${etiquetaMes(mesDeCierre)}` : "Tienes"}
        </span>
        <Monto valor={total} moneda={moneda} signo="negativo" className="text-2xl" />
        {hayDeuda && (
          /* En palabras, no solo color: quien no distingue el ámbar ni el rojo
              igual lee que hay una deuda y cuánto. */
          <p className="text-xs text-muted-foreground">
            {mesDeCierre ? "Debías en tarjetas:" : "Debes en tarjetas:"}{" "}
            <span className="font-mono tabular-nums">{textoMonto(deuda, moneda)}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
