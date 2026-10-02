'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { PiggyBank } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Monto } from '@/components/monto';
import { EmptyState } from '@/components/empty-state';
import { FalloConsulta, mensajeDeFallo } from '@/components/fallo-consulta';
import { useChecklistDelMes } from '@/hooks/use-presupuesto';
import { useResumenMes } from '@/hooks/use-reportes';
import { cuantoSobraEnElMes } from '@/lib/cuanto-sobra';
import { etiquetaMes, tramoDelMes } from '@/lib/fecha';
import { cn } from '@/lib/utils';

/**
 * "Cuánto me sobra este mes": el cuadrito del Resumen.
 *
 * Cifra principal: lo que el presupuesto promete sobrar (ingresos esperados
 * menos gastos esperados; el ahorro no entra — decisión del dueño). Debajo,
 * el real del mes con los dos totales que el resumen ya expone, y el sentido
 * en palabras: "te sobran" o "te faltan", nunca solo el color.
 *
 * Se calcula SIEMPRE en el cliente, en la moneda y el mes que el Resumen ya
 * tiene elegidos — nunca se guarda y jamás junta monedas.
 *
 * Dos variantes, como el panel de presupuesto: "tarjeta" (bloque propio del
 * Resumen) y "suelta" — sin Card ni título — para cuando vive dentro de un
 * contenedor que ya trae su encabezado: que no haya tarjeta dentro de tarjeta.
 */
export function CuantoMeSobra({
  mes,
  moneda,
  variante = 'tarjeta',
  compartePantalla,
  anunciaPresupuesto = true,
  onFalloPresupuesto,
}: {
  mes: string;
  moneda: string;
  variante?: 'tarjeta' | 'suelta';
  /** `true` cuando otros fallos conviven en la pantalla: el propio deja de
   * anunciar solo y la pantalla compone el anuncio único (role="status").
   * Misma convención del resto de los bloques del Resumen. */
  compartePantalla?: boolean;
  /** `false` cuando otro bloque de la misma pantalla ya anuncia el fallo del
   * presupuesto (el panel de presupuesto, que consulta lo mismo): este
   * cuadrito muestra su propio bloque, con su Reintentar, pero sin repetir la
   * interrupción. Dos `role="alert"` de la MISMA consulta son una tormenta;
   * dos de consultas distintas, no. */
  anunciaPresupuesto?: boolean;
  /** Avisa a la pantalla si el presupuesto no se pudo leer, para que componga
   * el anuncio único y ningún bloque quede sin voz. */
  onFalloPresupuesto?: (fallo: boolean) => void;
}) {
  const checklist = useChecklistDelMes({ month: mes, currency: moneda });
  const resumen = useResumenMes({ month: mes, currency: moneda });

  // Con datos viejos en memoria se siguen mostrando (stale, no falsos); un
  // fallo sin nada en mano es lo que aquí se dice.
  const falloChecklist = checklist.isError && !checklist.data;
  const falloResumen = resumen.isError && !resumen.data;
  // Una consulta pausada (sin conexión) no está cargando ni falló: sin esto
  // el cuadrito quedaría en blanco sin decir por qué.
  const pausada = checklist.isPaused || resumen.isPaused;

  useSubirFallo(falloChecklist, onFalloPresupuesto);

  // El error manda sobre el esqueleto: si UNA consulta falló y la otra sigue
  // cargando, el fallo no puede quedar tapado por el "cargando".
  const cargando =
    (checklist.isLoading && !falloResumen && !resumen.isPaused) ||
    (resumen.isLoading && !falloChecklist && !checklist.isPaused);

  const estado =
    !falloChecklist && !falloResumen && checklist.data && resumen.data
      ? cuantoSobraEnElMes({
          renglones: checklist.data.items,
          income: resumen.data.income,
          expense: resumen.data.expense,
        })
      : undefined;

  // Sin alguno de los dos lados no hay resta que mostrar: un "previsto" con un
  // lado en cero sería una cifra que nadie presupuestó. Pero el REAL del mes
  // sí existe y se muestra: no se esconde plata ya movida por falta de un
  // presupuesto. El vacío total (sin presupuesto y sin movimientos) es aparte.
  const faltaIngresos = estado !== undefined && !estado.hayIngresos;
  const faltaGastos = estado !== undefined && !estado.hayGastos;
  const faltaUnLado = faltaIngresos || faltaGastos;
  const sinMovimientos = estado !== undefined && estado.realUnidades === 0n;
  const vacioTotal = faltaUnLado && sinMovimientos;

  const tramo = tramoDelMes(mes);

  const enlacePresupuestar = (
    <Link
      href="/presupuesto"
      className={cn(buttonVariants({ variant: 'outline' }), 'mt-2 min-h-11')}
    >
      Presupuestar
    </Link>
  );

  const cuerpo = (
    <>
      {cargando ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-56" />
        </div>
      ) : falloChecklist || falloResumen ? (
        <FalloConsulta
          etiquetaBoton={falloChecklist ? 'Reintentar presupuesto' : 'Reintentar resumen'}
          mensaje={
            falloChecklist
              ? mensajeDeFallo(
                  checklist.error,
                  'No pudimos cargar tu presupuesto del mes. Puede ser que el servidor esté dormido.',
                )
              : mensajeDeFallo(
                  resumen.error,
                  'No pudimos cargar el resumen del mes. Puede ser que el servidor esté dormido.',
                )
          }
          reintento={checklist.isFetching || resumen.isFetching}
          onReintentar={() => {
            void checklist.refetch();
            void resumen.refetch();
          }}
          compartePantalla={compartePantalla || (falloChecklist && !anunciaPresupuesto)}
        />
      ) : pausada ? (
        // Sin red la consulta queda en pausa, no en error: se dice y se ofrece
        // reintentar en vez de un cuerpo en blanco.
        <FalloConsulta
          etiquetaBoton="Reintentar"
          mensaje="Sin conexión: no pudimos cargar este mes. Vuelve a intentarlo cuando tengas red."
          reintento={false}
          onReintentar={() => {
            void checklist.refetch();
            void resumen.refetch();
          }}
          compartePantalla={compartePantalla}
        />
      ) : vacioTotal ? (
        <EmptyState
          Icono={PiggyBank}
          titulo={`Aún no hay presupuesto para ${etiquetaMes(mes)}`}
          descripcion="Presupuesta los ingresos que esperas recibir y los gastos que esperas tener, y este cuadrito dirá cuánto te sobra."
        >
          {enlacePresupuestar}
        </EmptyState>
      ) : estado ? (
        <>
          {faltaUnLado ? (
            // Falta un lado del presupuesto: el real del mes se muestra
            // igual, y aquí se invita a completar el presupuesto. Nunca un
            // previsto inventado con un lado en cero.
            <>
              <p className="text-sm text-muted-foreground">
                {textoDelReal(tramo)}:{' '}
                <Monto valor={estado.real} moneda={moneda} signo="negativo" className="text-base" />
              </p>
              <p className="mt-1 text-sm font-medium">
                {textoDelSigno(estado.realUnidades)} este mes.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {faltaIngresos && faltaGastos
                  ? 'Presupuesta tus ingresos y tus gastos para saber cuánto te sobra.'
                  : faltaIngresos
                    ? 'Presupuesta los ingresos que esperas recibir para saber cuánto te sobra.'
                    : 'Presupuesta los gastos que esperas tener para saber cuánto te sobra.'}
              </p>
              {enlacePresupuestar}
            </>
          ) : (
            <>
              {/* Principal: el previsto, en Figure Hero como el balance del
                  mes, en tinta neutra (no es una ganancia): signo solo si es
                  negativo. La cifra llega como texto exacto, sin Number. */}
              <Monto
                valor={estado.previsto}
                moneda={moneda}
                signo="negativo"
                className="text-2xl"
              />
              {/* El real solo tiene sentido en un mes ya empezado; en uno
                  futuro decir "hasta hoy" sería falso y mostrar cero, un
                  cero que nadie vivió. */}
              {tramo !== 'futuro' && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {textoDelReal(tramo)}:{' '}
                  <Monto
                    valor={estado.real}
                    moneda={moneda}
                    signo="negativo"
                    className="text-base"
                  />
                </p>
              )}
              {/* El sentido lo dice la palabra, no solo el color — para el
                  previsto y también para el real. */}
              <p className="mt-1 text-sm font-medium">
                {textoDelSigno(estado.previstoUnidades)} según lo previsto en{' '}
                {etiquetaMes(mes)}.
              </p>
              {tramo !== 'futuro' && (
                <p className="mt-1 text-sm font-medium">
                  {textoDelSigno(estado.realUnidades)} este mes.
                </p>
              )}
            </>
          )}
        </>
      ) : null}
    </>
  );

  if (variante === 'suelta') {
    return <div className="flex flex-col">{cuerpo}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cuánto me sobra este mes</CardTitle>
      </CardHeader>
      <CardContent>{cuerpo}</CardContent>
    </Card>
  );
}

/**
 * Cómo se llama el real según el mes mirado: "Hasta hoy" solo vale en el mes
 * en curso; un mes pasado ya es completo y uno futuro todavía no empezó.
 */
function textoDelReal(tramo: "pasado" | "actual" | "futuro"): string {
  if (tramo === 'actual') return 'Hasta hoy';
  if (tramo === 'pasado') return 'En el mes';
  return 'Hasta ahora';
}

/** El sentido de una cifra en palabras: nunca solo el color. */
function textoDelSigno(unidades: bigint): string {
  if (unidades > 0n) return 'Te sobran';
  if (unidades < 0n) return 'Te faltan';
  return 'Ni te sobra ni te falta';
}

/** Sube a la pantalla el fallo del presupuesto cuando cambia (un solo sitio
 * que consulta el checklist reporta, aunque el panel lo consulte también). */
function useSubirFallo(fallo: boolean, avisar?: (fallo: boolean) => void) {
  useEffect(() => {
    avisar?.(fallo);
  }, [fallo, avisar]);
}
