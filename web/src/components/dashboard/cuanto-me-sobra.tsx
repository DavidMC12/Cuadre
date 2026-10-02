'use client';

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
import { etiquetaMes } from '@/lib/fecha';
import { cn } from '@/lib/utils';

/**
 * "Cuánto me sobra este mes": el cuadrito del Resumen.
 *
 * Cifra principal: lo que el presupuesto promete sobrar (ingresos esperados
 * menos gastos esperados; el ahorro no entra — decisión del dueño). Debajo,
 * el real hasta hoy con los dos totales que el resumen del mes ya expone, y
 * el sentido en palabras: "te sobran" o "te faltan", nunca solo el color.
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
}: {
  mes: string;
  moneda: string;
  variante?: 'tarjeta' | 'suelta';
  /** `true` cuando otros fallos conviven en la pantalla: el propio deja de
   * anunciar solo y la pantalla compone el anuncio único (role="status").
   * Misma convención del resto de los bloques del Resumen. */
  compartePantalla?: boolean;
}) {
  const checklist = useChecklistDelMes({ month: mes, currency: moneda });
  const resumen = useResumenMes({ month: mes, currency: moneda });

  const cargando = checklist.isLoading || resumen.isLoading;
  // Con datos viejos en memoria se siguen mostrando (stale, no falsos); un
  // fallo sin nada en mano es lo que aquí se dice. Si solo falla uno, él
  // anuncia; no hay tormenta porque este cuadrito solo abre su propio bloque.
  const falloChecklist = checklist.isError && !checklist.data;
  const falloResumen = resumen.isError && !resumen.data;

  const estado =
    !falloChecklist && !falloResumen && checklist.data && resumen.data
      ? cuantoSobraEnElMes({
          renglones: checklist.data.items,
          income: resumen.data.income,
          expense: resumen.data.expense,
        })
      : undefined;

  // Sin alguno de los dos lados no hay resta que mostrar: un "previsto" con un
  // lado en cero sería una cifra que nadie presupuestó. Se invita a armarlo.
  const sinPresupuesto = estado !== undefined && (!estado.hayIngresos || !estado.hayGastos);

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
          compartePantalla={compartePantalla}
        />
      ) : sinPresupuesto ? (
        <EmptyState
          Icono={PiggyBank}
          titulo={`Aún no hay presupuesto para ${etiquetaMes(mes)}`}
          descripcion={
            estado && estado.hayIngresos
              ? 'Falta decir cuánto esperas gastar este mes; presupuéstalo para que esta cuenta exista.'
              : estado && estado.hayGastos
                ? 'Presupuesta también los ingresos que esperas recibir este mes, para que esta cuenta pueda existir.'
                : 'Presupuesta los ingresos que esperas recibir y los gastos que esperas tener, y este cuadrito dirá cuánto te sobra.'
          }
        >
          <Link
            href="/presupuesto"
            className={cn(buttonVariants({ variant: 'outline' }), 'mt-2 min-h-11')}
          >
            Presupuestar
          </Link>
        </EmptyState>
      ) : estado ? (
        <>
          {/* Principal: el previsto, en Figure Hero como el balance del mes.
              La cifra llega como texto exacto del cálculo: nunca pasa por
              Number. Un negativo se muestra con su menos (el monto neutro,
              sin rojo). */}
          <Monto valor={estado.previsto} moneda={moneda} className="text-2xl" />
          <p className="mt-2 text-sm text-muted-foreground">
            Hasta hoy: <Monto valor={estado.real} moneda={moneda} className="text-base" />
          </p>
          {/* El sentido lo dice la palabra, no solo el color: la misma cifra
              cambia de "te sobran" a "te faltan". */}
          <p className="mt-1 text-sm font-medium">
            {estado.previstoUnidades >= 0n ? 'Te sobran' : 'Te faltan'} según lo previsto en{' '}
            {etiquetaMes(mes)}.
          </p>
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
