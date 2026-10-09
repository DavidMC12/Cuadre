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
import { ZONA_HORARIA } from '../../shared/zona-horaria.js';
import type { TipoDeCategoria } from './schemas.js';

/**
 * Regla 1 y 2: ni las transferencias, ni los saldos iniciales, ni los ajustes
 * son movimiento de plata propia. Pasar dinero de Bancolombia a Efectivo no es
 * gastar, el saldo con el que arranca una cuenta no es plata que entró este
 * mes, y un ajuste solo corrige un saldo para que coincida con el banco.
 */
const SOLO_INGRESOS_Y_GASTOS = sql`m.kind not in ('transfer', 'opening', 'adjustment')`;

/**
 * Para el ahorro: lo que la persona decide apartar. Solo cuentan las
 * transferencias hacia o desde una cuenta de ahorro (más los registros manuales
 * de `savings_entries`). Un ingreso que llega a una cuenta de ahorro, un gasto
 * pagado desde ella, el saldo inicial y un ajuste NO son ahorro: son saldo.
 */
const SOLO_TRASLADOS = sql`m.kind = 'transfer'`;

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
function rangoDelMes(mes: string, columna: SQL = sql`m.occurred_at`): SQL {
  const primerDia = sql`(${mes}::text || '-01')::timestamp`;

  return sql`${columna} >= (${primerDia} at time zone ${ZONA_HORARIA}::text)
         and ${columna} <  ((${primerDia} + interval '1 month') at time zone ${ZONA_HORARIA}::text)`;
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

/**
 * Cuánto se ha gastado en una categoría puntual, en un mes y una moneda
 * puntuales. Es la misma cuenta que hace `totalesPorCategoria`, pero para
 * una sola categoría y sin agrupar — la usa el checklist de presupuesto para
 * comparar "lo gastado" contra el monto que la persona puso.
 */
export async function gastadoEnCategoria(
  usuarioId: string,
  mes: string,
  moneda: string,
  categoriaId: string,
): Promise<string> {
  const filas = (await db.execute(sql`
    select coalesce(sum(- m.amount) filter (where ${MONTO_QUE_CLASIFICA} < 0), 0)::numeric(19,4)::text as total
    from transactions m
    ${UNION_CON_EL_ANULADO}
    where m.user_id = ${usuarioId}::uuid
      and ${deLaMoneda(moneda)}
      and ${SOLO_INGRESOS_Y_GASTOS}
      and ${rangoDelMes(mes)}
      and ${CATEGORIA_QUE_CLASIFICA} = ${categoriaId}::uuid
  `)) as unknown as { total: string }[];

  return filas[0]?.total ?? '0.0000';
}

/** A qué ítem cuenta la fila: el de su original si es una anulación. */
const ITEM_QUE_CLASIFICA = sql`coalesce(anulado.budget_item_id, m.budget_item_id)`;

export interface ProgresoDeUnItem {
  itemId: string;
  /** Lo gastado (o pagado) en el mes: gastos y pagos a tarjeta asignados al ítem. */
  gastado: string;
  /** Lo recibido en el mes: ingresos asignados al ítem. */
  recibido: string;
}

/**
 * Lo que cuenta para CADA ítem del presupuesto en un mes y una moneda, en una
 * sola consulta: solo los movimientos asignados a ese ítem, no todos los de su
 * categoría. Sin esto, siete ítems de "Deudas" mostrarían el mismo gasto cada
 * uno.
 *
 * A propósito NO usa `SOLO_INGRESOS_Y_GASTOS`: el pago a una tarjeta es una
 * transferencia (no es gasto ni ingreso en los reportes), pero sí es lo que
 * "paga" el ítem de esa deuda. Solo la pata de salida lleva el ítem, y la regla
 * 3 (la anulación se clasifica como su original) hace que se cancele sola. Un
 * saldo inicial o un ajuste jamás llevan ítem, lo prohíbe la base.
 */
export async function progresoPorItemEnElMes(
  usuarioId: string,
  mes: string,
  moneda: string,
): Promise<ProgresoDeUnItem[]> {
  const filas = (await db.execute(sql`
    select ${ITEM_QUE_CLASIFICA} as "itemId",
      coalesce(sum(- m.amount) filter (where ${MONTO_QUE_CLASIFICA} < 0), 0)::numeric(19,4)::text as gastado,
      coalesce(sum(m.amount)   filter (where ${MONTO_QUE_CLASIFICA} > 0), 0)::numeric(19,4)::text as recibido
    from transactions m
    ${UNION_CON_EL_ANULADO}
    where m.user_id = ${usuarioId}::uuid
      and ${deLaMoneda(moneda)}
      and ${rangoDelMes(mes)}
      and ${ITEM_QUE_CLASIFICA} is not null
    group by 1
  `)) as unknown as ProgresoDeUnItem[];

  return filas;
}

export interface SinAsignarDeUnaCategoria {
  categoryId: string;
  /** Gastado en la categoría sin ítem asignado. */
  gastado: string;
  /** Recibido en la categoría sin ítem asignado. */
  recibido: string;
}

/**
 * Lo que se movió en cada categoría en un mes y una moneda SIN ítem asignado:
 * lo que le falta decidir a quien registró. Es lo que queda de la categoría
 * después de restar lo de sus ítems, así que ítems + "sin asignar" = el total
 * de la categoría en los reportes (gastos e ingresos, sin transferencias).
 */
export async function sinAsignarPorCategoria(
  usuarioId: string,
  mes: string,
  moneda: string,
): Promise<SinAsignarDeUnaCategoria[]> {
  const filas = (await db.execute(sql`
    select ${CATEGORIA_QUE_CLASIFICA} as "categoryId",
      coalesce(sum(- m.amount) filter (where ${MONTO_QUE_CLASIFICA} < 0), 0)::numeric(19,4)::text as gastado,
      coalesce(sum(m.amount)   filter (where ${MONTO_QUE_CLASIFICA} > 0), 0)::numeric(19,4)::text as recibido
    from transactions m
    ${UNION_CON_EL_ANULADO}
    where m.user_id = ${usuarioId}::uuid
      and ${deLaMoneda(moneda)}
      and ${SOLO_INGRESOS_Y_GASTOS}
      and ${rangoDelMes(mes)}
      and ${CATEGORIA_QUE_CLASIFICA} is not null
      and ${ITEM_QUE_CLASIFICA} is null
    group by 1
  `)) as unknown as SinAsignarDeUnaCategoria[];

  return filas;
}

/**
 * Ahorro de UNA cuenta puntual en UN mes puntual, con signo — la versión de
 * `ahorroMensual` que usa el checklist de presupuesto, que compara una
 * cuenta a la vez contra su propia meta en vez de sumar todas las cuentas de
 * ahorro de una moneda.
 *
 * Es lo que la persona APARTÓ ese mes: transferencias hacia o desde la cuenta
 * (la anulación de una transferencia es otra transferencia de signo contrario,
 * así que se cancela sola) más los registros manuales de ahorro. No es el
 * cambio de saldo de la cuenta: un ingreso que cae ahí no cuenta.
 *
 * A propósito no filtra por `is_savings`: el ítem del checklist ya eligió
 * esta cuenta puntual al crearse (ahí sí se exige que esté marcada), así que
 * aquí basta con que la cuenta sea de este usuario. Tampoco hace falta
 * `deLaMoneda` (regla 4): una cuenta tiene una única moneda fija
 * (`transactions_account_fk` la amarra), así que pedir "esta cuenta" ya
 * implica una sola moneda sin tener que decirlo aparte.
 */
export async function ahorroDeUnaCuentaEnElMes(
  usuarioId: string,
  mes: string,
  cuentaId: string,
): Promise<string> {
  const filas = (await db.execute(sql`
    select (
      coalesce((
        select sum(m.amount)
        from transactions m
        where m.user_id = ${usuarioId}::uuid
          and m.account_id = ${cuentaId}::uuid
          and ${SOLO_TRASLADOS}
          and ${rangoDelMes(mes)}
      ), 0)
      +
      coalesce((
        select sum(e.amount)
        from savings_entries e
        where e.user_id = ${usuarioId}::uuid
          and e.account_id = ${cuentaId}::uuid
          and ${rangoDelMes(mes, sql`e.occurred_at`)}
      ), 0)
    )::numeric(19,4)::text as amount
  `)) as unknown as { amount: string }[];

  return filas[0]?.amount ?? '0.0000';
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

export interface AhorroDeUnMes {
  month: string;
  amount: string;
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

/**
 * Ahorro mensual, NO acumulado: cada mes es solo lo que la persona APARTÓ ese
 * mes en las cuentas marcadas como ahorro (`accounts.is_savings`), con signo —
 * igual que `tendencia`, un mes sin movimiento sale en cero en vez de
 * desaparecer, y nunca se mezclan monedas (regla 4).
 *
 * Cuenta SOLO lo que la persona decidió apartar: las transferencias hacia o
 * desde esas cuentas (una anulación es otra transferencia de signo contrario y
 * se cancela sola) y los registros manuales de `savings_entries`. NO cuenta un
 * ingreso que cae en esa cuenta, un gasto pagado desde ella, el saldo inicial
 * ni un ajuste: eso es saldo, no ahorro.
 *
 * Ojo con esto: la marca de "ahorro" se lee al momento de la consulta, no al
 * momento del movimiento. Desmarcar una cuenta vacía su historial completo
 * de este reporte de golpe (todos los meses pasados vuelven a cero), y
 * marcar una cuenta vieja hace aparecer de golpe todo lo que ya tenía. Es a
 * propósito —"ahorro" es una etiqueta descriptiva de hoy, no algo que se
 * pueda fechar retroactivamente— pero por eso esta gráfica no es estable en
 * el tiempo: puede cambiar sin que nadie haya tocado un movimiento.
 */
export async function ahorroMensual(
  usuarioId: string,
  cantidadDeMeses: number,
  moneda: string,
): Promise<AhorroDeUnMes[]> {
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
    aportes as (
      select m.occurred_at, m.amount
      from transactions m
      inner join accounts a
              on a.id = m.account_id
             and a.user_id = m.user_id
      where m.user_id = ${usuarioId}::uuid
        and ${deLaMoneda(moneda)}
        and ${SOLO_TRASLADOS}
        and a.is_savings = true
      union all
      select e.occurred_at, e.amount
      from savings_entries e
      inner join accounts a
              on a.id = e.account_id
             and a.user_id = e.user_id
      where e.user_id = ${usuarioId}::uuid
        and e.currency = ${moneda}::text
        and a.is_savings = true
    ),
    totales as (
      select date_trunc('month', aportes.occurred_at at time zone ${ZONA_HORARIA}::text) as mes,
             sum(aportes.amount) as amount
      from aportes
      cross join ventana
      where aportes.occurred_at >= (ventana.desde at time zone ${ZONA_HORARIA}::text)
        and aportes.occurred_at <  (ventana.hasta at time zone ${ZONA_HORARIA}::text)
      group by 1
    )
    select to_char(meses.mes, 'YYYY-MM')                    as month,
           coalesce(totales.amount, 0)::numeric(19,4)::text as amount
    from meses
    left join totales on totales.mes = meses.mes
    order by meses.mes asc
  `)) as unknown as AhorroDeUnMes[];

  return filas;
}
