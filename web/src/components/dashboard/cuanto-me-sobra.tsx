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
import { cuantoSobraEnElMes, textoDeUnidades, type CuantoSobra } from '@/lib/cuanto-sobra';
import { textoMonto } from '@/lib/money';
import { cn } from '@/lib/utils';
import { etiquetaMes } from '@/lib/fecha';

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
 */
export function CuantoMeSobra({
  mes,
  moneda,
  compartePantalla,
}: {
  mes: string;
  moneda: string;
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

  const sinPresupuesto = estado !== undefined && (!estado.hayIngresos || !estado.hayGastos);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cuánto me sobra este mes</CardTitle>
      </CardHeader>
      <CardContent>
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
            {/* Principal: el previsto, en Figure Hero como el balance del mes. */}
            <Monto valor={textoDeUnidades(estado.previsto)} moneda={moneda} className="text-2xl" />
            <p className="mt-2 text-sm text-muted-foreground">
              Hasta hoy:{' '}
              <Monto valor={textoDeUnidades(estado.real)} moneda={moneda} className="text-base" />
            </p>
            {/* El sentido lo dice la palabra, no solo el color: la misma cifra
                cambia de "te sobran" a "te faltan". */}
            <p className="mt-1 text-sm font-medium">
              {estado.previsto >= 0n ? 'Te sobran' : 'Te faltan'}{' '}
              {textoMonto(textoDeUnidades(estado.previsto), moneda)} según lo previsto en{' '}
              {etiquetaMes(mes)}.
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
