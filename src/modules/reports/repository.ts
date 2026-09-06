/**
 * SQL de los reportes. Nada más: ni reglas de negocio ni HTTP.
 *
 * Aquí se decide si el tablero dice la verdad o miente, así que las cuatro
 * reglas que lo sostienen están escritas abajo como fragmentos con nombre, y
 * todas las consultas las usan. Si alguna consulta se olvidara de una, el
 * número que muestre la pantalla sería mentira.
 *
 * `usuarioId` es siempre el primer parámetro y nunca es implícito.
 */
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client.js';
import type { TipoDeCategoria } from './schemas.js';

/**
 * La zona con la que se agrupa por mes.
 *
 * Un gasto del 30 de septiembre a las 11 de la noche en Bogotá es el 1 de
 * octubre en UTC. Agrupar en UTC lo mandaría al mes que no es, y el reporte de
 * septiembre le quedaría corto a quien lo hizo.
 *
 * Hoy es una constante porque hoy la app tiene un solo dueño. En la Fase 5,
 * con usuarios reales, sale de su perfil.
 */
export const ZONA_HORARIA = 'America/Bogota';

/**
 * Regla 1 y 2: ni las transferencias ni los saldos iniciales son movimiento de
 * plata propia. Pasar dinero de Bancolombia a Efectivo no es gastar, y el saldo
 * con el que arranca una cuenta no es plata que entró este mes.
 */
const SOLO_INGRESOS_Y_GASTOS = sql`m.kind not in ('transfer', 'opening')`;

/**
 * Regla 3: una anulación no es un evento propio, es el borrado de otro. Por eso
 * se clasifica exactamente como el movimiento que borra —el mismo lado del
 * reporte y la misma categoría—, aunque su monto vaya al revés. Así el gasto y
 * su anulación caen en el mismo balde, suman cero, y el mes queda como si el
 * gasto nunca hubiera existido.
 *
 * Ojo: esto NO es filtrar los anulados. Todas las filas se suman siempre; lo
 * único que decide esta unión es en qué balde cae cada una. Filtrarlas sería
 * justo lo que descuadra las cuentas.
 */
const UNION_CON_EL_ANULADO = sql`
  left join transactions anulado
         on anulado.id = m.reverses_transaction_id
        and anulado.user_id = m.user_id`;

/** El monto cuyo signo decide de qué lado del reporte cae la fila. */
const MONTO_QUE_CLASIFICA = sql`coalesce(anulado.amount, m.amount)`;

/** La categoría que decide en qué balde cae la fila. */
const CATEGORIA_QUE_CLASIFICA = sql`coalesce(anulado.category_id, m.category_id)`;

/**
 * Los límites de un mes, dichos en hora de Bogotá y comparados contra la
 * columna tal como está guardada: así la comparación aprovecha el índice por
 * fecha en vez de recalcular la zona horaria fila por fila.
 */
function rangoDelMes(mes: string): SQL {
  const primerDia = sql`(${mes}::text || '-01')::timestamp`;

  return sql`m.occurred_at >= (${primerDia} at time zone ${ZONA_HORARIA}::text)
         and m.occurred_at <  ((${primerDia} + interval '1 month') at time zone ${ZONA_HORARIA}::text)`;
}

/**
 * Regla 4: nunca se suman monedas distintas. Pesos con dólares da un número que
 * no significa nada, así que la moneda no es un filtro opcional: es parte de la
 * pregunta.
 */
const deLaMoneda = (moneda: string): SQL => sql`m.currency = ${moneda}::text`;

// -----------------------------------------------------------------------------

/** Las monedas en las que esta persona tiene cuentas, archivadas incluidas. */
export async function monedasConCuentas(usuarioId: string): Promise<string[]> {
  const filas = (await db.execute(sql`
    select distinct currency
    from accounts
    where user_id = ${usuarioId}::uuid
    order by currency
  `)) as unknown as { currency: string }[];

  return filas.map((fila) => fila.currency.trim());
}

export interface TotalesDelMes {
  income: string;
  expense: string;
}

export async function totalesDelMes(
  usuarioId: string,
  mes: string,
  moneda: string,
): Promise<TotalesDelMes> {
  const filas = (await db.execute(sql`
    select
      coalesce(sum(m.amount)   filter (where ${MONTO_QUE_CLASIFICA} > 0), 0)::numeric(19,4)::text as income,
      coalesce(sum(- m.amount) filter (where ${MONTO_QUE_CLASIFICA} < 0), 0)::numeric(19,4)::text as expense
    from transactions m
    ${UNION_CON_EL_ANULADO}
    where m.user_id = ${usuarioId}::uuid
      and ${deLaMoneda(moneda)}
      and ${SOLO_INGRESOS_Y_GASTOS}
      and ${rangoDelMes(mes)}
  `)) as unknown as TotalesDelMes[];

  // Un agregado sin `group by` siempre devuelve una fila, aunque no haya datos.
  return filas[0] ?? { income: '0.0000', expense: '0.0000' };
}

export interface TotalDeCategoria {
  categoryId: string | null;
  categoryName: string | null;
  total: string;
}

export async function totalesPorCategoria(
  usuarioId: string,
  mes: string,
  moneda: string,
  tipo: TipoDeCategoria,
): Promise<TotalDeCategoria[]> {
  // El total sale positivo aunque los gastos estén guardados en negativo: la
  // pregunta es "cuánto gastaste", no "cuánto quedó".
  const total = tipo === 'expense' ? sql`sum(- m.amount)` : sql`sum(m.amount)`;

  const ladoDelReporte =
    tipo === 'expense' ? sql`${MONTO_QUE_CLASIFICA} < 0` : sql`${MONTO_QUE_CLASIFICA} > 0`;

  const filas = (await db.execute(sql`
    select ${CATEGORIA_QUE_CLASIFICA} as "categoryId",
           categoria.name             as "categoryName",
           ${total}::numeric(19,4)::text as total
    from transactions m
    ${UNION_CON_EL_ANULADO}
    left join categories categoria
           on categoria.id = ${CATEGORIA_QUE_CLASIFICA}
          and categoria.user_id = m.user_id
    where m.user_id = ${usuarioId}::uuid
      and ${deLaMoneda(moneda)}
      and ${SOLO_INGRESOS_Y_GASTOS}
      and ${rangoDelMes(mes)}
      and ${ladoDelReporte}
    group by ${CATEGORIA_QUE_CLASIFICA}, categoria.name
    having ${total} <> 0
    order by ${total} desc, categoria.name asc
  `)) as unknown as TotalDeCategoria[];

  return filas;
}

export interface TotalDeUnMes {
  month: string;
  income: string;
  expense: string;
}

/**
 * Los últimos meses, terminando en el mes de hoy.
 *
 * Los meses los genera la base con `generate_series`, no la consulta de los
 * movimientos: así un mes sin nada sale en cero en vez de desaparecer. Si se
 * saltara, la gráfica pegaría dos meses lejanos uno al lado del otro y el ojo
 * leería una caída que nunca pasó.
 */
export async function tendencia(
  usuarioId: string,
  cantidadDeMeses: number,
  moneda: string,
): Promise<TotalDeUnMes[]> {
  const filas = (await db.execute(sql`
    with limites as (
      select date_trunc('month', now() at time zone ${ZONA_HORARIA}::text) as mes_actual
    ),
    meses as (
      select generate_series(
               mes_actual - make_interval(months => ${cantidadDeMeses - 1}::int),
               mes_actual,
               interval '1 month'
             ) as mes
      from limites
    ),
    ventana as (
      select min(mes) as desde, max(mes) + interval '1 month' as hasta from meses
    ),
    totales as (
      select date_trunc('month', m.occurred_at at time zone ${ZONA_HORARIA}::text) as mes,
             sum(m.amount)   filter (where ${MONTO_QUE_CLASIFICA} > 0) as income,
             sum(- m.amount) filter (where ${MONTO_QUE_CLASIFICA} < 0) as expense
      from transactions m
      ${UNION_CON_EL_ANULADO}
      cross join ventana
      where m.user_id = ${usuarioId}::uuid
        and ${deLaMoneda(moneda)}
        and ${SOLO_INGRESOS_Y_GASTOS}
        and m.occurred_at >= (ventana.desde at time zone ${ZONA_HORARIA}::text)
        and m.occurred_at <  (ventana.hasta at time zone ${ZONA_HORARIA}::text)
      group by 1
    )
    select to_char(meses.mes, 'YYYY-MM')                    as month,
           coalesce(totales.income, 0)::numeric(19,4)::text  as income,
           coalesce(totales.expense, 0)::numeric(19,4)::text as expense
    from meses
    left join totales on totales.mes = meses.mes
    order by meses.mes asc
  `)) as unknown as TotalDeUnMes[];

  return filas;
}
