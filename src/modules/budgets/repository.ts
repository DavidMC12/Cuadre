/**
 * SQL del checklist de presupuesto. Nada más: ni reglas de negocio ni HTTP.
 *
 * La pieza que sostiene todo este módulo es que un monto nunca se pisa: se
 * guarda versionado por mes en `budget_item_targets`, y para saber cuál
 * aplica a un mes dado se toma la fila con `effective_from` más grande que
 * no pase de ese mes (y, si hay empate, la más reciente). Eso es lo que hace
 * `objetivoEnElMes` más abajo, y todas las consultas que necesitan "el monto
 * de este ítem para este mes" reutilizan exactamente ese fragmento.
 */
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { ZONA_HORARIA } from '../../shared/zona-horaria.js';
import type { BudgetItemKind } from './schemas.js';

/**
 * El monto vigente de un ítem para un mes dado, como subconsulta
 * correlacionada contra `bi` (el alias de `budget_items` en la consulta que
 * la usa). Nunca es un `UPDATE`: es "la versión más nueva que ya empezó a
 * regir cuando llegó ese mes".
 */
function objetivoEnElMes(mes: string): SQL {
  return sql`(
    select t.amount
    from budget_item_targets t
    where t.budget_item_id = bi.id
      and t.effective_from <= (${mes}::text || '-01')::date
    order by t.effective_from desc, t.created_at desc
    limit 1
  )`;
}

/** El mes calendario de hoy, en hora de Bogotá, como "2026-09". */
export async function mesActual(): Promise<string> {
  const [fila] = (await db.execute(sql`
    select to_char(date_trunc('month', now() at time zone ${ZONA_HORARIA}::text), 'YYYY-MM') as mes
  `)) as unknown as { mes: string }[];

  if (!fila) throw new Error('No se pudo calcular el mes actual.');
  return fila.mes;
}

export interface ItemDePresupuesto {
  id: string;
  kind: BudgetItemKind;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  label: string | null;
  /** El monto vigente en el mes pedido. Nulo si el ítem no existía todavía. */
  currentAmount: string | null;
  archivedAt: string | null;
}

const CAMPOS_DEL_ITEM = sql`
  bi.id, bi.kind, bi.currency, bi.category_id as "categoryId", cat.name as "categoryName",
  bi.account_id as "accountId", acc.name as "accountName", bi.label,
  bi.archived_at as "archivedAt"
`;

function conNombres() {
  return sql`
    from budget_items bi
    left join categories cat on cat.id = bi.category_id and cat.user_id = bi.user_id
    left join accounts acc on acc.id = bi.account_id and acc.user_id = bi.user_id
  `;
}

type FilaDeItem = Omit<ItemDePresupuesto, 'archivedAt'> & { archivedAt: Date | string | null };

function aItem(fila: FilaDeItem): ItemDePresupuesto {
  return {
    ...fila,
    currency: fila.currency.trim(),
    archivedAt: fila.archivedAt ? new Date(fila.archivedAt).toISOString() : null,
  };
}

/** Todos los ítems del checklist de un usuario, con su monto vigente en `mes`. */
export async function listar(
  usuarioId: string,
  mes: string,
  incluirArchivados: boolean,
): Promise<ItemDePresupuesto[]> {
  const filtroArchivados = incluirArchivados ? sql`` : sql`and bi.archived_at is null`;

  const filas = (await db.execute(sql`
    select ${CAMPOS_DEL_ITEM}, ${objetivoEnElMes(mes)}::text as "currentAmount"
    ${conNombres()}
    where bi.user_id = ${usuarioId}::uuid
    ${filtroArchivados}
    order by bi.created_at asc
  `)) as unknown as FilaDeItem[];

  return filas.map(aItem);
}

export async function obtener(
  usuarioId: string,
  itemId: string,
  mes: string,
): Promise<ItemDePresupuesto | null> {
  const [fila] = (await db.execute(sql`
    select ${CAMPOS_DEL_ITEM}, ${objetivoEnElMes(mes)}::text as "currentAmount"
    ${conNombres()}
    where bi.user_id = ${usuarioId}::uuid and bi.id = ${itemId}::uuid
    limit 1
  `)) as unknown as FilaDeItem[];

  return fila ? aItem(fila) : null;
}

/** Crea el ítem y su primer monto en una sola operación atómica. */
export async function crear(
  usuarioId: string,
  datos: {
    kind: BudgetItemKind;
    currency: string;
    categoryId: string | null;
    accountId: string | null;
    label: string | null;
    amount: string;
    mesEfectivoDesde: string;
  },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [fila] = (await tx.execute(sql`
      insert into budget_items (user_id, kind, currency, category_id, account_id, label)
      values (
        ${usuarioId}::uuid, ${datos.kind}, ${datos.currency},
        ${datos.categoryId}::uuid, ${datos.accountId}::uuid, ${datos.label}
      )
      returning id
    `)) as unknown as { id: string }[];

    if (!fila) throw new Error('No se pudo crear el ítem de presupuesto.');

    await tx.execute(sql`
      insert into budget_item_targets (budget_item_id, effective_from, amount)
      values (${fila.id}::uuid, (${datos.mesEfectivoDesde}::text || '-01')::date, ${datos.amount})
    `);

    return fila.id;
  });
}

/**
 * Agrega un monto nuevo desde `mesEfectivoDesde` en adelante. Nunca pisa una
 * fila existente — si ya había un monto puesto para ese mismo mes, esta fila
 * queda como la más reciente y gana por `created_at` (ver `objetivoEnElMes`).
 * Devuelve `false` si el ítem no existe o no es de este usuario.
 */
export async function agregarObjetivo(
  usuarioId: string,
  itemId: string,
  monto: string,
  mesEfectivoDesde: string,
): Promise<boolean> {
  const [fila] = (await db.execute(sql`
    insert into budget_item_targets (budget_item_id, effective_from, amount)
    select ${itemId}::uuid, (${mesEfectivoDesde}::text || '-01')::date, ${monto}
    where exists (
      select 1 from budget_items where id = ${itemId}::uuid and user_id = ${usuarioId}::uuid
    )
    returning id
  `)) as unknown as { id: string }[];

  return fila !== undefined;
}

export async function editarEtiqueta(
  usuarioId: string,
  itemId: string,
  label: string | null,
): Promise<boolean> {
  const [fila] = (await db.execute(sql`
    update budget_items set label = ${label}
    where user_id = ${usuarioId}::uuid and id = ${itemId}::uuid
    returning id
  `)) as unknown as { id: string }[];

  return fila !== undefined;
}

export async function archivar(usuarioId: string, itemId: string): Promise<boolean> {
  const [fila] = (await db.execute(sql`
    update budget_items set archived_at = now()
    where user_id = ${usuarioId}::uuid and id = ${itemId}::uuid and archived_at is null
    returning id
  `)) as unknown as { id: string }[];

  return fila !== undefined;
}

export async function desarchivar(usuarioId: string, itemId: string): Promise<boolean> {
  const [fila] = (await db.execute(sql`
    update budget_items set archived_at = null
    where user_id = ${usuarioId}::uuid and id = ${itemId}::uuid
    returning id
  `)) as unknown as { id: string }[];

  return fila !== undefined;
}

export interface ObjetivoDelMes {
  id: string;
  kind: BudgetItemKind;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  label: string | null;
  /** Nulo si el ítem se creó después de ese mes: no aplica, no se muestra en 0. */
  target: string | null;
}

/**
 * Los ítems activos de una moneda, con su monto vigente para `mes` — la
 * lista de "qué hay que revisar este mes", sin el progreso todavía: el
 * progreso (cuánto se ha gastado o ahorrado) lo calcula el service llamando
 * al de `reports`, porque leer movimientos es su trabajo, no el de este
 * módulo.
 */
export async function objetivosDelMes(
  usuarioId: string,
  mes: string,
  moneda: string,
): Promise<ObjetivoDelMes[]> {
  const filas = (await db.execute(sql`
    select ${CAMPOS_DEL_ITEM}, ${objetivoEnElMes(mes)}::text as target
    ${conNombres()}
    where bi.user_id = ${usuarioId}::uuid
      and bi.currency = ${moneda}::text
      and bi.archived_at is null
    order by bi.created_at asc
  `)) as unknown as ObjetivoDelMes[];

  return filas.map((fila) => ({ ...fila, currency: fila.currency.trim() }));
}
