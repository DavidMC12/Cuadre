"use client";

import { useTheme } from "next-themes";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { FalloConsulta } from "@/components/fallo-consulta";
import type { TendenciaMes } from "@/lib/api/types";
import { etiquetaMes, etiquetaMesCorta } from "@/lib/fecha";
import { sumarMontos, textoMonto } from "@/lib/money";
import { COLOR_GASTO, COLOR_INGRESO, modoDeTema, type ModoColor } from "@/lib/chart-colors";

interface FilaTendencia {
  mes: string;
  etiqueta: string;
  ingreso: string;
  gasto: string;
  /** Solo para el alto de las barras; el texto exacto va en `ingreso`/`gasto`. */
  ingresoNumerico: number;
  gastoNumerico: number;
}

function TooltipTendencia({
  active,
  payload,
  label,
  moneda,
  modo,
}: {
  active?: boolean;
  payload?: { payload: FilaTendencia }[];
  label?: string;
  moneda: string;
  modo: ModoColor;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const fila = payload[0].payload;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-popover px-2.5 py-1.5 text-xs text-popover-foreground ring-1 ring-foreground/10">
      <p className="font-medium">{label}</p>
      <p style={{ color: COLOR_INGRESO[modo] }}>Ingresos: {textoMonto(fila.ingreso, moneda)}</p>
      <p style={{ color: COLOR_GASTO[modo] }}>Gastos: {textoMonto(fila.gasto, moneda)}</p>
    </div>
  );
}

export function GraficaTendencia({
  tendencia,
  moneda,
  cargando,
  fallo,
}: {
  tendencia: TendenciaMes[] | undefined;
  moneda: string;
  cargando: boolean;
  /** La consulta de la tendencia no se pudo leer: no es lo mismo que meses
   * sin movimientos. Objeto a propósito: mensaje y reintentar van juntos.
   * `etiquetaBoton` para cuando pueda convivir con otro Reintentar en
   * pantalla y se distinga de oído. */
  fallo?: {
    mensaje: string;
    reintento?: boolean;
    onReintentar: () => void;
    etiquetaBoton?: string;
  };
}) {
  const { resolvedTheme } = useTheme();
  const modo = modoDeTema(resolvedTheme);

  if (fallo) {
    return (
      <FalloConsulta
        mensaje={fallo.mensaje}
        reintento={fallo.reintento}
        onReintentar={fallo.onReintentar}
        etiquetaBoton={fallo.etiquetaBoton}
      />
    );
  }

  if (cargando) {
    return <Skeleton className="h-48 w-full rounded-lg" />;
  }

  const datos: FilaTendencia[] = (tendencia ?? []).map((mes) => ({
    mes: mes.month,
    etiqueta: etiquetaMesCorta(mes.month),
    ingreso: mes.income,
    gasto: mes.expense,
    ingresoNumerico: Number(mes.income),
    gastoNumerico: Number(mes.expense),
  }));

  const sinMovimientos = datos.every(
    (fila) => fila.ingresoNumerico === 0 && fila.gastoNumerico === 0
  );

  // Con 12 meses las etiquetas no caben de frente en un celular: se inclinan
  // para que se vean todas. Con 6 caben horizontales.
  const etiquetasInclinadas = datos.length > 6;
  // Un mes sin movimientos no tiene barra (valdría cero, no se dibuja), y sin
  // nada que lo marque parecía que el mes no existía. Un punto neutro en la
  // línea de cero lo deja ver sin inventar un monto.
  const mesesVacios = datos.filter(
    (fila) => fila.ingresoNumerico === 0 && fila.gastoNumerico === 0
  );

  if (datos.length === 0 || sinMovimientos) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Todavía no hay suficientes meses con movimientos.
      </p>
    );
  }

  // El resumen que reemplaza a la gráfica para quien no la ve: los mismos
  // totales del periodo, en una frase. El SVG queda decorativo y el dato
  // completo, en la tabla oculta de abajo.
  const totalIngresos = sumarMontos(datos.map((fila) => fila.ingreso));
  const totalGastos = sumarMontos(datos.map((fila) => fila.gasto));
  const primerMes = etiquetaMes(datos[0].mes);
  const ultimoMes = etiquetaMes(datos[datos.length - 1].mes);
  const resumen =
    `Tendencia de ${datos.length} meses, de ${primerMes} a ${ultimoMes}. ` +
    `Ingresos ${textoMonto(totalIngresos, moneda)}; gastos ${textoMonto(totalGastos, moneda)}.`;

  return (
    <div>
      <div role="img" aria-label={resumen}>
        <div aria-hidden>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={datos} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barGap={4}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="etiqueta"
                tickLine={false}
                axisLine={false}
                // `0` muestra todas las etiquetas; el encogido lo resuelve la
                // inclinación de arriba, no escondiendo meses.
                interval={0}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                angle={etiquetasInclinadas ? -45 : 0}
                textAnchor={etiquetasInclinadas ? "end" : "middle"}
                height={etiquetasInclinadas ? 48 : 30}
                // Con las etiquetas inclinadas y ancladas al final, la primera se
                // estira hacia la izquierda y se saldría del SVG (Recharts ya no
                // empuja los bordes con `interval={0}`). Este hueco la deja adentro.
                padding={etiquetasInclinadas ? { left: 16 } : undefined}
              />
              <YAxis hide />
              <Tooltip
                content={<TooltipTendencia moneda={moneda} modo={modo} />}
                cursor={{ fill: "var(--muted)" }}
              />
              {/* Leyenda propia: el orden que arma Recharts a partir de los <Bar>
                  no siempre respeta el orden en el que se declaran. */}
              <Legend
                verticalAlign="top"
                height={28}
                content={() => (
                  <div className="mb-1 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block size-2 rounded-full"
                        style={{ backgroundColor: COLOR_INGRESO[modo] }}
                      />
                      Ingresos
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block size-2 rounded-full"
                        style={{ backgroundColor: COLOR_GASTO[modo] }}
                      />
                      Gastos
                    </span>
                  </div>
                )}
              />
              <Bar
                dataKey="ingresoNumerico"
                name="Ingresos"
                fill={COLOR_INGRESO[modo]}
                radius={[4, 4, 0, 0]}
                maxBarSize={20}
              />
              <Bar
                dataKey="gastoNumerico"
                name="Gastos"
                fill={COLOR_GASTO[modo]}
                radius={[4, 4, 0, 0]}
                maxBarSize={20}
              />
              {mesesVacios.map((fila) => (
                <ReferenceDot
                  key={fila.mes}
                  x={fila.etiqueta}
                  y={0}
                  r={3}
                  fill="var(--muted-foreground)"
                  stroke="none"
                  ifOverflow="visible"
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alternativa textual del gráfico: los mismos meses y montos, para un
          lector de pantalla, sin ocupar un pixel a la vista. */}
      <table className="sr-only">
        <caption>Tendencia de ingresos y gastos por mes</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Ingresos</th>
            <th scope="col">Gastos</th>
          </tr>
        </thead>
        <tbody>
          {datos.map((fila) => (
            <tr key={fila.mes}>
              <th scope="row">{etiquetaMes(fila.mes)}</th>
              <td>{textoMonto(fila.ingreso, moneda)}</td>
              <td>{textoMonto(fila.gasto, moneda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
