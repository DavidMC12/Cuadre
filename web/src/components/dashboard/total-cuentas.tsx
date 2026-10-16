import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Monto } from "@/components/monto";
import type { Cuenta } from "@/lib/api/types";
import {
  CLASES_CONTENIDO_TOTALES,
  CLASES_DEUDA_TOTALES,
  CLASES_ETIQUETA_TOTALES,
  CLASES_TEXTO_ESQUELETO,
  etiquetaCuentas,
  etiquetaDeudaTarjetas,
} from "@/lib/tarjetas-totales";
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
 *
 * El esqueleto no es un bloque de alto fijo: es la MISMA tarjeta (mismas
 * cajas, mismos paddings y gaps) con pulsantes donde van la etiqueta, el
 * monto y la deuda. Los renglones de texto llevan el texto real invisible
 * (`text-transparent`), así su alto —una o dos líneas, según el ancho y el
 * nombre del mes— ya es el de la tarjeta: cargando → cargado, la página no
 * salta. La PRESENCIA del renglón de deuda no se inventa: viene de
 * `cuentasDeReferencia` (la última lista conocida, normalmente la de hoy) —
 * en la primera carga fría no hay lista anterior y el esqueleto apuesta por
 * "sin deuda", el mínimo que medía también el bloque fijo de antes.
 */
export function TotalCuentas({
  cuentas,
  moneda,
  cargando,
  mesDeCierre,
  cuentasDeReferencia,
}: {
  cuentas: Cuenta[] | undefined;
  moneda: string;
  cargando: boolean;
  /** Definido solo cuando se mira un mes pasado: la tarjeta habla del cierre. */
  mesDeCierre?: string;
  /**
   * La última lista de cuentas que la pantalla vio (normalmente la de hoy,
   * mientras la lista del cierre viaja). Solo la mira el esqueleto, para
   * adivinar si la tarjeta que llegará lleva renglón de deuda.
   */
  cuentasDeReferencia?: Cuenta[];
}) {
  if (cargando) {
    // Sin lista de referencia (carga fría) el renglón de deuda no figura: es
    // la apuesta de menos ruido, y es la que se puede sostener con datos.
    const deudaConocida = deudaEnTarjetas(cuentasDeReferencia ?? [], moneda);

    return (
      <Card aria-hidden="true">
        <CardContent className={CLASES_CONTENIDO_TOTALES}>
          {/* La barra de la etiqueta lleva el MISMO texto que verá la tarjeta
              (transparente sobre el pulse): parte en dos renglones igual que
              ella, con el nombre del mes real, en cualquier ancho. */}
          <Skeleton className={CLASES_ETIQUETA_TOTALES + " " + CLASES_TEXTO_ESQUELETO}>
            {etiquetaCuentas(mesDeCierre)}
          </Skeleton>
          {/* La cifra va en text-2xl: line-height 2rem, una barra h-8. */}
          <Skeleton className="h-8 w-44" />
          {aUnidadesMinimas(deudaConocida) > 0n && (
            <Skeleton className={CLASES_DEUDA_TOTALES + " " + CLASES_TEXTO_ESQUELETO}>
              {`${etiquetaDeudaTarjetas(mesDeCierre)} ${textoMonto(
                deudaConocida,
                moneda
              )}`}
            </Skeleton>
          )}
        </CardContent>
      </Card>
    );
  }

  const total = totalDeTienes(cuentas ?? [], moneda);
  // La deuda de las tarjetas activas de esta moneda. Sin tarjetas, o con
  // tarjetas que no deben nada, no se pinta: un "Debes $0" sería ruido.
  const deuda = deudaEnTarjetas(cuentas ?? [], moneda);
  const hayDeuda = aUnidadesMinimas(deuda) > 0n;

  return (
    <Card>
      <CardContent className={CLASES_CONTENIDO_TOTALES}>
        {/* La etiqueta larga parte en dos líneas sola (el contenedor deja
            crecer el alto) y no rompe el piso táctil: nada de lo que hay aquí
            abajo es un botón. */}
        <span className={CLASES_ETIQUETA_TOTALES}>{etiquetaCuentas(mesDeCierre)}</span>
        <Monto valor={total} moneda={moneda} signo="negativo" className="text-2xl" />
        {hayDeuda && (
          /* En palabras, no solo color: quien no distingue el ámbar ni el rojo
              igual lee que hay una deuda y cuánto. */
          <p className={CLASES_DEUDA_TOTALES}>
            {etiquetaDeudaTarjetas(mesDeCierre)}{" "}
            <span className="font-mono tabular-nums">{textoMonto(deuda, moneda)}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
