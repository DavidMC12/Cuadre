"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import type { TendenciaMes } from "@/lib/api/types";
import { etiquetaMesCorta } from "@/lib/fecha";
import { textoMonto } from "@/lib/money";
import { COLOR_GASTO, COLOR_INGRESO } from "@/lib/chart-colors";

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
}: {
  active?: boolean;
  payload?: { payload: FilaTendencia }[];
  label?: string;
  moneda: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const fila = payload[0].payload;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-popover px-2.5 py-1.5 text-xs text-popover-foreground ring-1 ring-foreground/10">
      <p className="font-medium">{label}</p>
      <p style={{ color: COLOR_INGRESO.claro }}>Ingresos: {textoMonto(fila.ingreso, moneda)}</p>
      <p style={{ color: COLOR_GASTO.claro }}>Gastos: {textoMonto(fila.gasto, moneda)}</p>
    </div>
  );
}

export function GraficaTendencia({
  tendencia,
  moneda,
  cargando,
}: {
  tendencia: TendenciaMes[] | undefined;
  moneda: string;
  cargando: boolean;
}) {
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

  if (datos.length === 0 || sinMovimientos) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Todavía no hay suficientes meses con movimientos.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={datos} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barGap={4}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="etiqueta"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <YAxis hide />
        <Tooltip content={<TooltipTendencia moneda={moneda} />} cursor={{ fill: "var(--muted)" }} />
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
                  style={{ backgroundColor: COLOR_INGRESO.claro }}
                />
                Ingresos
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: COLOR_GASTO.claro }}
                />
                Gastos
              </span>
            </div>
          )}
        />
        <Bar
          dataKey="ingresoNumerico"
          name="Ingresos"
          fill={COLOR_INGRESO.claro}
          radius={[4, 4, 0, 0]}
          maxBarSize={20}
        />
        <Bar
          dataKey="gastoNumerico"
          name="Gastos"
          fill={COLOR_GASTO.claro}
          radius={[4, 4, 0, 0]}
          maxBarSize={20}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
