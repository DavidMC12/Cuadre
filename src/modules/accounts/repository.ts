/**
 * SQL de las cuentas. El saldo NUNCA sale de una columna: siempre viene de la
 * vista `account_balances`, que lo calcula sumando los movimientos.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Ejecutor } from '../../db/client.js';
import { db } from '../../db/client.js';
import { accountBalances, accounts } from '../../db/schema/index.js';
import type { Cuenta } from './schemas.js';

const CAMPOS = {
  id: accounts.id,
  name: accounts.name,
  type: accounts.type,
  currency: accounts.currency,
  archivedAt: accounts.archivedAt,
  isSavings: accounts.isSavings,
  balance: accountBalances.balance,
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
        : string;
};

function aCuenta(fila: FilaDeCuenta): Cuenta {
  return {
    id: fila.id,
    name: fila.name,
    type: fila.type as Cuenta['type'],
    currency: fila.currency.trim(),
    balance: fila.balance,
    movementCount: Number(fila.movementCount),
    lastMovementAt: fila.lastMovementAt?.toISOString() ?? null,
    archivedAt: fila.archivedAt?.toISOString() ?? null,
    isSavings: fila.isSavings,
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
  datos: { nombre: string; tipo: string; moneda: string; esAhorro: boolean },
): Promise<string> {
  const [fila] = await ejecutor
    .insert(accounts)
    .values({
      userId: usuarioId,
      name: datos.nombre,
      type: datos.tipo as 'bank' | 'card' | 'cash',
      currency: datos.moneda,
      isSavings: datos.esAhorro,
    })
    .returning({ id: accounts.id });

  if (!fila) throw new Error('No se pudo crear la cuenta.');
  return fila.id;
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
