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
import { FalloConsulta, estadoDeConsulta, mensajeDeCargaFallida, mensajeDeFallo, mensajeSinConexion } from "@/components/fallo-consulta";
import { useAhorroMensual } from "@/hooks/use-reportes";
import { useSubirNoLeible } from "@/hooks/use-subir-no-leible";
import { etiquetaMes, etiquetaMesCorta } from "@/lib/fecha";
import { aUnidadesMinimas, esCero, negar, sumarMontos, textoMonto } from "@/lib/money";
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

/**
 * La pista no cromática de una barra: el verbo dice si ese mes se apartó plata
 * o se retiró, sin depender del color — que sobre las barras es la única
 * señal. Un mes sin movimientos no es ni lo uno ni lo otro.
 */
export function verboDeAhorro(monto: string): "Ahorraste" | "Retiraste" | "Sin movimiento" {
  const valor = aUnidadesMinimas(monto);
  if (valor > 0n) return "Ahorraste";
  if (valor < 0n) return "Retiraste";
  return "Sin movimiento";
}

export function TooltipAhorro({
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
  const verbo = verboDeAhorro(fila.monto);
  // El retiro ya se nombra en el verbo; el monto se muestra sin el menos para
  // no decir dos veces que se restó. La pista no cromática es el verbo.
  const montoVisible = verbo === "Retiraste" ? negar(fila.monto) : fila.monto;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-popover px-2.5 py-1.5 text-xs text-popover-foreground ring-1 ring-foreground/10">
      <p className="font-medium">{label}</p>
      <p style={{ color: fila.color }}>
        {verbo === "Sin movimiento"
          ? `Sin movimientos: ${textoMonto(esCero(fila.monto) ? "0" : fila.monto, moneda)}`
          : `${verbo}: ${textoMonto(montoVisible, moneda)}`}
      </p>
    </div>
  );
}

/**
 * Cuánto se apartó (transferencias hacia cuentas de ahorro más lo anotado a
 * mano) menos cuánto se sacó, mes a mes. Una sola serie de barras: la
 * pregunta es una —cuánto se apartó— y cada barra se pinta según el signo de
 * su mes, igual que el componente `Monto`.
 */
export function GraficaAhorro({
  months,
  currency,
  compartePantalla,
  onNoLeible,
}: {
  months: number;
  currency: string;
  /** `true` cuando otros fallos conviven en la misma pantalla: el bloque
   * deja de anunciar solo: la pantalla compone el anuncio único (role="status") o queda un solo alert hablando por todos. */
  compartePantalla?: boolean;
  /** Avisa a la pantalla si esta consulta no se pudo leer (fallo o pausa sin
   * red), para que la composición del anuncio único la cuente y no queden dos
   * voces compitiendo. */
  onNoLeible?: (noLeible: boolean) => void;
}) {
  const { resolvedTheme } = useTheme();
  const modo = modoDeTema(resolvedTheme);
  const {
    data: ahorro,
    isLoading,
    isError,
    error,
    isPaused,
    isFetching,
    refetch,
  } = useAhorroMensual({ months, currency });

  const estado = estadoDeConsulta({ data: ahorro, isError, isPaused, isLoading });
  const noLeible = estado === "fallo" || estado === "pausada";

  useSubirNoLeible(noLeible, onNoLeible);

  // La consulta del ahorro no se pudo leer, o quedó pausada sin red: no es lo
  // mismo que una cuenta de ahorro quieta. Se dice y se ofrece reintentar.
  if (estado === "fallo") {
    return (
      <FalloConsulta
        etiquetaBoton="Reintentar ahorro"
        mensaje={mensajeDeFallo(error, mensajeDeCargaFallida("el ahorro"))}
        reintento={isFetching}
        onReintentar={() => refetch()}
        compartePantalla={compartePantalla}
      />
    );
  }

  if (estado === "pausada") {
    return (
      <FalloConsulta
        etiquetaBoton="Reintentar ahorro"
        mensaje={mensajeSinConexion("el ahorro")}
        onReintentar={() => refetch()}
        compartePantalla={compartePantalla}
      />
    );
  }

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

  // El resumen que reemplaza a la gráfica para quien no la ve: el mismo
  // total del periodo, en una frase. El SVG queda decorativo y el dato
  // completo, en la tabla oculta de abajo.
  const total = sumarMontos(datos.map((fila) => fila.monto));
  const primerMes = etiquetaMes(datos[0].mes);
  const ultimoMes = etiquetaMes(datos[datos.length - 1].mes);
  const resumen =
    `Ahorro de ${datos.length} meses, de ${primerMes} a ${ultimoMes}. ` +
    `Total ${textoMonto(total, currency)}.`;

  return (
    <div>
      <div role="img" aria-label={resumen}>
        <div aria-hidden>
          <ResponsiveContainer width="100%" height={200}>
            {/* Misma razón que en la tendencia: el dato vive en el aria-label
                y en la tabla, y la capa de accesibilidad de Recharts dejaría
                un SVG enfocable dentro de un contenedor aria-hidden. */}
            <BarChart
              data={datos}
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              accessibilityLayer={false}
            >
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
        </div>
      </div>

      {/* Alternativa textual del gráfico: los mismos meses y montos, para un
          lector de pantalla, sin ocupar un pixel a la vista. */}
      <table className="sr-only">
        <caption>Ahorro por mes</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Movimiento</th>
            <th scope="col">Ahorro</th>
          </tr>
        </thead>
        <tbody>
          {datos.map((fila) => (
            <tr key={fila.mes}>
              <th scope="row">{etiquetaMes(fila.mes)}</th>
              <td>{verboDeAhorro(fila.monto)}</td>
              <td>{textoMonto(esCero(fila.monto) ? "0" : fila.monto, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
