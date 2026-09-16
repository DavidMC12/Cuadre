"use client";

import { useTheme } from "next-themes";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { useAhorroMensual } from "@/hooks/use-reportes";
import { etiquetaMesCorta } from "@/lib/fecha";
import { textoMonto } from "@/lib/money";
import { colorPorSigno, modoDeTema } from "@/lib/chart-colors";

interface FilaAhorro {
  mes: string;
  etiqueta: string;
  /** El texto exacto, para el tooltip. */
  monto: string;
  /** Solo para el alto de la barra; nunca se usa para una cuenta de dinero. */
  montoNumerico: number;
  color: string;
}

function TooltipAhorro({
  active,
  payload,
  label,
  moneda,
}: {
  active?: boolean;
  payload?: { payload: FilaAhorro }[];
  label?: string;
  moneda: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const fila = payload[0].payload;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-popover px-2.5 py-1.5 text-xs text-popover-foreground ring-1 ring-foreground/10">
      <p className="font-medium">{label}</p>
      <p style={{ color: fila.color }}>Ahorro: {textoMonto(fila.monto, moneda)}</p>
    </div>
  );
}

/**
 * Cuánto entró menos cuánto salió de las cuentas de ahorro, mes a mes. Una
 * sola serie de barras: la pregunta es una —cuánto se apartó— y cada barra se
 * pinta según el signo de su mes, igual que el componente `Monto`.
 */
export function GraficaAhorro({ months, currency }: { months: number; currency: string }) {
  const { resolvedTheme } = useTheme();
  const modo = modoDeTema(resolvedTheme);
  const { data: ahorro, isLoading } = useAhorroMensual({ months, currency });

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-lg" />;
  }

  const datos: FilaAhorro[] = (ahorro ?? []).map((mes) => ({
    mes: mes.month,
    etiqueta: etiquetaMesCorta(mes.month),
    monto: mes.amount,
    montoNumerico: Number(mes.amount),
    color: colorPorSigno(mes.amount, modo),
  }));

  const sinMovimientos = datos.every((fila) => fila.montoNumerico === 0);

  // Con 12 meses las etiquetas no caben de frente en un celular: se inclinan
  // para que se vean todas. Con 6 caben horizontales.
  const etiquetasInclinadas = datos.length > 6;
  // Un mes sin movimientos no dibuja barra (valdría cero) y sin nada que lo
  // marque parecía que el mes no existía. Un punto neutro en la línea de cero
  // lo deja ver sin inventar un monto.
  const mesesVacios = datos.filter((fila) => fila.montoNumerico === 0);

  if (datos.length === 0 || sinMovimientos) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Todavía no hay movimientos en tus cuentas de ahorro.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={datos} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="etiqueta"
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          angle={etiquetasInclinadas ? -45 : 0}
          textAnchor={etiquetasInclinadas ? "end" : "middle"}
          height={etiquetasInclinadas ? 48 : 30}
          padding={etiquetasInclinadas ? { left: 16 } : undefined}
        />
        <YAxis hide />
        <Tooltip content={<TooltipAhorro moneda={currency} />} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="montoNumerico" radius={[4, 4, 0, 0]} maxBarSize={20}>
          {datos.map((fila) => (
            <Cell key={fila.mes} fill={fila.color} />
          ))}
        </Bar>
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
  );
}
