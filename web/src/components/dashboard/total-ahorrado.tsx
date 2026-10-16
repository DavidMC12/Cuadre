"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Monto } from "@/components/monto";
import { FormularioAhorro } from "@/components/ahorro/formulario-ahorro";
import type { Cuenta } from "@/lib/api/types";
import {
  CLASES_BOTON_AHORRADO,
  CLASES_CONTENIDO_TOTALES,
  CLASES_ETIQUETA_TOTALES,
  CLASES_FRASE_AHORRADO,
  CLASES_TEXTO_ESQUELETO,
  FRASE_AHORRADO,
  etiquetaAhorrado,
} from "@/lib/tarjetas-totales";
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
 *
 * Con `mesDeCierre` ("YYYY-MM") la lista llega cortada al cierre de ese mes y
 * la tarjeta dice "Ahorrado al cierre de...". El botón de registrar se va:
 * registrar HOY no cambia el cierre de un mes pasado, y un botón que no
 * haría nada visible (ni debería) solo confundiría. La frase de lo apartado
 * se queda: explica la cifra que se ve.
 *
 * El esqueleto copia la MISMA estructura (mismas cajas, paddings y gaps) con
 * pulsantes donde van la etiqueta, el monto, la frase y —solo en el mes en
 * curso— el botón. Los renglones de texto llevan el texto real invisible
 * (`text-transparent`): su alto ya es el de la tarjeta en cualquier ancho, y
 * la diferencia de altura entre ambos tramos es solo la que de verdad los
 * separa (el botón): cargando → cargado no salta.
 */
export function TotalAhorrado({
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
  if (cargando) {
    return (
      <Card aria-hidden="true">
        <CardContent className={CLASES_CONTENIDO_TOTALES}>
          {/* La barra de la etiqueta lleva el MISMO texto que verá la tarjeta:
              parte en dos renglones igual que ella, en cualquier ancho. */}
          <Skeleton className={CLASES_ETIQUETA_TOTALES + " " + CLASES_TEXTO_ESQUELETO}>
            {etiquetaAhorrado(mesDeCierre)}
          </Skeleton>
          {/* La cifra va en text-2xl: line-height 2rem, una barra h-8. */}
          <Skeleton className="h-8 w-44" />
          <Skeleton className={CLASES_FRASE_AHORRADO + " " + CLASES_TEXTO_ESQUELETO}>
            {FRASE_AHORRADO}
          </Skeleton>
          {/* El piso del botón (min-h-11) y su margen, solo en el mes en
              curso: en un mes pasado el botón no existe. */}
          {!mesDeCierre && <Skeleton className={CLASES_BOTON_AHORRADO + " h-11 w-36"} />}
        </CardContent>
      </Card>
    );
  }

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
      <CardContent className={CLASES_CONTENIDO_TOTALES}>
        {/* La etiqueta larga parte en dos líneas sola; el renglón de abajo
            (no es un botón) completa la tarjeta sin desbordar a 320px. */}
        <span className={CLASES_ETIQUETA_TOTALES}>{etiquetaAhorrado(mesDeCierre)}</span>
        <Monto valor={total} moneda={moneda} signo="negativo" className="text-2xl" />
        <p className={CLASES_FRASE_AHORRADO}>{FRASE_AHORRADO}</p>
        {!mesDeCierre && (
          <FormularioAhorro cuentas={deAhorro}>
            <Button
              type="button"
              variant="outline"
              className={CLASES_BOTON_AHORRADO}
            >
              Registrar ahorro
            </Button>
          </FormularioAhorro>
        )}
      </CardContent>
    </Card>
  );
}
