/**
 * SQL de las cuentas. El saldo NUNCA sale de una columna: siempre viene de la
 * vista `account_balances`, que lo calcula sumando los movimientos.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Ejecutor } from '../../db/client.js';
import { db } from '../../db/client.js';
import { accountBalances, accounts } from '../../db/schema/index.js';
import { ZONA_HORARIA } from '../../shared/zona-horaria.js';
import type { Cuenta } from './schemas.js';

const CAMPOS = {
  id: accounts.id,
  name: accounts.name,
  type: accounts.type,
  currency: accounts.currency,
  archivedAt: accounts.archivedAt,
  isSavings: accounts.isSavings,
  creditLimit: accounts.creditLimit,
  linkedAccountId: accounts.linkedAccountId,
  balance: accountBalances.balance,
  /**
   * Lo AHORRADO en la cuenta (no su saldo): lo que la persona decidió apartar,
   * o sea las transferencias hacia/desde ella más sus registros manuales de
   * ahorro (`savings_entries`). Solo tiene sentido en una cuenta de ahorro; en
   * las demás es cero. Se calcula al leer, nunca se guarda.
   */
  saved: sql<string>`case when ${accounts.isSavings} then (
    coalesce((
      select sum(t.amount) from transactions t
      where t.user_id = ${accounts.userId}
        and t.account_id = ${accounts.id}
        and t.kind = 'transfer'
    ), 0)
    +
    coalesce((
      select sum(e.amount) from savings_entries e
      where e.user_id = ${accounts.userId}
        and e.account_id = ${accounts.id}
    ), 0)
  )::numeric(19,4)::text else '0.0000' end`,
  movementCount: accountBalances.movementCount,
  lastMovementAt: accountBalances.lastMovementAt,
};

type FilaDeCuenta = {
  [K in keyof typeof CAMPOS]: K extends 'archivedAt' | 'lastMovementAt'
    ? Date | null
    : K extends 'movementCount'
      ? number
      : K extends 'isSavings'
        ? boolean
        : K extends 'creditLimit'
          ? string | null
          : K extends 'linkedAccountId'
            ? string | null
            : string;
};

function aCuenta(fila: FilaDeCuenta): Cuenta {
  return {
    id: fila.id,
    name: fila.name,
    type: fila.type as Cuenta['type'],
    currency: fila.currency.trim(),
    balance: fila.balance,
    saved: fila.saved,
    movementCount: Number(fila.movementCount),
    lastMovementAt: fila.lastMovementAt?.toISOString() ?? null,
    archivedAt: fila.archivedAt?.toISOString() ?? null,
    isSavings: fila.isSavings,
    creditLimit: fila.creditLimit,
    linkedAccountId: fila.linkedAccountId,
  };
}

/** La cuenta y su saldo van siempre juntos, así que la unión se hace una vez. */
function consulta(ejecutor: Ejecutor) {
  return ejecutor
    .select(CAMPOS)
    .from(accounts)
    .innerJoin(
      accountBalances,
      and(eq(accountBalances.accountId, accounts.id), eq(accountBalances.userId, accounts.userId)),
    );
}

// -----------------------------------------------------------------------------

export async function listar(usuarioId: string, incluirArchivadas: boolean): Promise<Cuenta[]> {
  const condiciones = [eq(accounts.userId, usuarioId)];
  if (!incluirArchivadas) condiciones.push(isNull(accounts.archivedAt));

  const filas = await consulta(db)
    .where(and(...condiciones))
    .orderBy(asc(accounts.name));

  return filas.map(aCuenta);
}

/**
 * Las cuentas tal como estaban al CIERRE de un mes ("YYYY-MM", en hora de
 * Bogotá): el saldo y lo ahorrado suman solo los movimientos (y registros de
 * ahorro) con fecha anterior al primer instante del mes siguiente. Es la misma
 * cuenta que la vista `account_balances`, cortada en una fecha: el saldo sigue
 * siendo la suma del libro, nunca una columna.
 *
 * Una cuenta archivada DESPUÉS de ese cierre cuenta como abierta (entonces lo
 * estaba, y su saldo entra en lo que tenías): `archivedAt` solo se informa si
 * el archivo fue antes del cierre. `movementCount` y `lastMovementAt` también
 * miran solo hasta el cierre.
 */
export async function listarAlCierreDelMes(
  usuarioId: string,
  mes: string,
  incluirArchivadas: boolean,
): Promise<Cuenta[]> {
  const cierre = sql`(((${mes}::text || '-01')::timestamp + interval '1 month') at time zone ${ZONA_HORARIA}::text)`;

  const filas = (await db.execute(sql`
    select
      a.id,
      a.name,
      a.type,
      a.currency,
      a.is_savings as "isSavings",
      a.credit_limit::text as "creditLimit",
      a.linked_account_id as "linkedAccountId",
      case when a.archived_at < ${cierre} then a.archived_at end as "archivedAt",
      coalesce(mov.saldo, 0)::numeric(19,4)::text as balance,
      coalesce(mov.cantidad, 0)::int as "movementCount",
      mov.ultimo as "lastMovementAt",
      case when a.is_savings then (
        coalesce((
          select sum(t.amount) from transactions t
          where t.user_id = a.user_id
            and t.account_id = a.id
            and t.kind = 'transfer'
            and t.occurred_at < ${cierre}
        ), 0)
        +
        coalesce((
          select sum(e.amount) from savings_entries e
          where e.user_id = a.user_id
            and e.account_id = a.id
            and e.occurred_at < ${cierre}
        ), 0)
      )::numeric(19,4)::text else '0.0000' end as saved
    from accounts a
    left join lateral (
      select sum(t.amount) as saldo, count(*) as cantidad, max(t.occurred_at) as ultimo
      from transactions t
      where t.user_id = a.user_id
        and t.account_id = a.id
        and t.occurred_at < ${cierre}
    ) mov on true
    where a.user_id = ${usuarioId}::uuid
      and (${incluirArchivadas}::boolean or a.archived_at is null or a.archived_at >= ${cierre})
    order by a.name asc
  `)) as unknown as {
    id: string;
    name: string;
    type: string;
    currency: string;
    isSavings: boolean;
    creditLimit: string | null;
    linkedAccountId: string | null;
    archivedAt: Date | string | null;
    balance: string;
    movementCount: number;
    lastMovementAt: Date | string | null;
    saved: string;
  }[];

  return filas.map((fila) => ({
    id: fila.id,
    name: fila.name,
    type: fila.type as Cuenta['type'],
    currency: fila.currency.trim(),
    balance: fila.balance,
    saved: fila.saved,
    movementCount: fila.movementCount,
    lastMovementAt: fila.lastMovementAt ? new Date(fila.lastMovementAt).toISOString() : null,
    archivedAt: fila.archivedAt ? new Date(fila.archivedAt).toISOString() : null,
    isSavings: fila.isSavings,
    creditLimit: fila.creditLimit,
    linkedAccountId: fila.linkedAccountId,
  }));
}

export async function obtener(
  ejecutor: Ejecutor,
  usuarioId: string,
  cuentaId: string,
): Promise<Cuenta | null> {
  const [fila] = await consulta(ejecutor)
    .where(and(eq(accounts.userId, usuarioId), eq(accounts.id, cuentaId)))
    .limit(1);

  return fila ? aCuenta(fila) : null;
}

export async function crear(
  ejecutor: Ejecutor,
  usuarioId: string,
  datos: {
    nombre: string;
    tipo: string;
    moneda: string;
    esAhorro: boolean;
    cupo: string | null;
    cuentaVinculadaId: string | null;
  },
): Promise<string> {
  const [fila] = await ejecutor
    .insert(accounts)
    .values({
      userId: usuarioId,
      name: datos.nombre,
      type: datos.tipo as 'bank' | 'card' | 'cash',
      currency: datos.moneda,
      isSavings: datos.esAhorro,
      creditLimit: datos.cupo,
      linkedAccountId: datos.cuentaVinculadaId,
    })
    .returning({ id: accounts.id });

  if (!fila) throw new Error('No se pudo crear la cuenta.');
  return fila.id;
}

/**
 * Edita nombre, cupo y/o cuenta vinculada. Solo toca las columnas que de
 * verdad vinieron en `cambios` — omitir una la deja como estaba, y pasarla en
 * `null` (cupo/cuentaVinculadaId) la borra. Devuelve `false` si la cuenta no
 * existe o no es de este usuario.
 */
export async function actualizar(
  usuarioId: string,
  cuentaId: string,
  cambios: { nombre?: string; cupo?: string | null; cuentaVinculadaId?: string | null },
): Promise<boolean> {
  const cambiosParaGuardar: Partial<typeof accounts.$inferInsert> = {};
  if (cambios.nombre !== undefined) cambiosParaGuardar.name = cambios.nombre;
  if (cambios.cupo !== undefined) cambiosParaGuardar.creditLimit = cambios.cupo;
  if (cambios.cuentaVinculadaId !== undefined) {
    cambiosParaGuardar.linkedAccountId = cambios.cuentaVinculadaId;
  }

  const filas = await db
    .update(accounts)
    .set(cambiosParaGuardar)
    .where(and(eq(accounts.userId, usuarioId), eq(accounts.id, cuentaId)))
    .returning({ id: accounts.id });

  return filas.length > 0;
}

/**
 * Bloquea la fila de la cuenta hasta que termine la transacción de quien llama,
 * para que dos ajustes de saldo simultáneos se hagan en fila. Devuelve false si
 * la cuenta no existe o no es de esta persona.
 */
export async function bloquear(
  ejecutor: Ejecutor,
  usuarioId: string,
  cuentaId: string,
): Promise<boolean> {
  const filas = (await ejecutor.execute(sql`
    select id from accounts
    where id = ${cuentaId}::uuid and user_id = ${usuarioId}::uuid
    for update
  `)) as unknown as { id: string }[];

  return filas.length > 0;
}

/**
 * Archivar, no borrar: la cuenta tiene historia colgando y esa historia no se
 * toca. Devuelve false si la cuenta no existe o no es de esta persona.
 */
export async function archivar(usuarioId: string, cuentaId: string): Promise<boolean> {
  const filas = await db
    .update(accounts)
    .set({ archivedAt: sql`now()` })
    .where(
      and(eq(accounts.userId, usuarioId), eq(accounts.id, cuentaId), isNull(accounts.archivedAt)),
    )
    .returning({ id: accounts.id });

  return filas.length > 0;
}

export async function desarchivar(usuarioId: string, cuentaId: string): Promise<boolean> {
  const filas = await db
    .update(accounts)
    .set({ archivedAt: null })
    .where(and(eq(accounts.userId, usuarioId), eq(accounts.id, cuentaId)))
    .returning({ id: accounts.id });

  return filas.length > 0;
}

/**
 * Marca o desmarca una cuenta como cuenta de ahorro. Nada más cambia aquí.
 *
 * A propósito no exige `isNull(archivedAt)` como sí hace `archivar()`: una
 * cuenta archivada puede marcarse igual, y su historia entra al reporte de
 * ahorro completa. No hay caso de uso real para impedirlo, y bloquearlo
 * obligaría a desarchivar solo para poner una etiqueta descriptiva.
 */
export async function marcarAhorro(
  usuarioId: string,
  cuentaId: string,
  esAhorro: boolean,
): Promise<boolean> {
  const filas = await db
    .update(accounts)
    .set({ isSavings: esAhorro })
    .where(and(eq(accounts.userId, usuarioId), eq(accounts.id, cuentaId)))
    .returning({ id: accounts.id });

  return filas.length > 0;
}
