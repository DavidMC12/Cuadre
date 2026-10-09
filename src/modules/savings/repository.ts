/**
 * SQL de los registros manuales de ahorro. Nada más: ni reglas de negocio ni
 * HTTP. `usuarioId` es siempre el primer parámetro y nunca es implícito.
 *
 * Un registro de ahorro NO es un movimiento: no cambia el saldo de ninguna
 * cuenta (ver `db/schema/savings.ts`).
 */
import { sql } from 'drizzle-orm';
import type { Ejecutor } from '../../db/client.js';
import { ZONA_HORARIA } from '../../shared/zona-horaria.js';
import type { RegistroDeAhorro } from './schemas.js';

interface FilaCruda {
  id: string;
  account_id: string;
  currency: string;
  amount: string;
  occurred_at: Date | string;
  description: string | null;
}

const aIso = (valor: Date | string): string =>
  valor instanceof Date ? valor.toISOString() : new Date(valor).toISOString();

function aRegistro(fila: FilaCruda): RegistroDeAhorro {
  return {
    id: fila.id,
    accountId: fila.account_id,
    currency: fila.currency.trim(),
    amount: fila.amount,
    occurredAt: aIso(fila.occurred_at),
    description: fila.description,
  };
}

const COLUMNAS = sql`id, account_id, currency, amount::text as amount, occurred_at, description`;

/**
 * Anota un ahorro tomando la moneda de la propia cuenta, en una sola sentencia.
 *
 * Devuelve null si la cuenta no existe, no es de esta persona, está archivada
 * o NO está marcada como de ahorro: solo ahí se puede anotar ahorro. Quien
 * llama distingue el caso mirando la cuenta.
 */
export async function registrar(
  ejecutor: Ejecutor,
  usuarioId: string,
  datos: {
    cuentaId: string;
    monto: string;
    ocurrioEn: string;
    descripcion?: string | null;
  },
): Promise<RegistroDeAhorro | null> {
  const filas = (await ejecutor.execute(sql`
    insert into savings_entries
      (user_id, account_id, currency, amount, occurred_at, description)
    select ${usuarioId}::uuid,
           cuenta.id,
           cuenta.currency,
           ${datos.monto}::numeric,
           ${datos.ocurrioEn}::timestamptz,
           ${datos.descripcion ?? null}::text
    from accounts cuenta
    where cuenta.id = ${datos.cuentaId}::uuid
      and cuenta.user_id = ${usuarioId}::uuid
      and cuenta.archived_at is null
      and cuenta.is_savings = true
    returning ${COLUMNAS}
  `)) as unknown as FilaCruda[];

  const fila = filas[0];
  return fila ? aRegistro(fila) : null;
}

/** Los registros de una cuenta, del más reciente al más viejo. */
export async function listarDeUnaCuenta(
  ejecutor: Ejecutor,
  usuarioId: string,
  cuentaId: string,
  limite: number,
): Promise<RegistroDeAhorro[]> {
  const filas = (await ejecutor.execute(sql`
    select ${COLUMNAS}
    from savings_entries
    where user_id = ${usuarioId}::uuid
      and account_id = ${cuentaId}::uuid
    order by occurred_at desc, created_at desc, id desc
    limit ${limite}::int
  `)) as unknown as FilaCruda[];

  return filas.map(aRegistro);
}

/** Una fila del respaldo: el registro con el nombre de su cuenta y la fecha ya en el día de la persona. */
export interface FilaDeAhorroParaExportar {
  id: string;
  fecha: string;
  cuenta: string;
  moneda: string;
  monto: string;
  descripcion: string | null;
}

/**
 * Todo lo anotado, de la cuenta que sea (también las archivadas), del más viejo
 * al más nuevo. Sin paginar a propósito: un respaldo a la mitad no sirve de
 * respaldo.
 */
export async function listarParaExportar(
  ejecutor: Ejecutor,
  usuarioId: string,
): Promise<FilaDeAhorroParaExportar[]> {
  const filas = (await ejecutor.execute(sql`
    select r.id,
           to_char(r.occurred_at at time zone ${ZONA_HORARIA}::text, 'YYYY-MM-DD') as fecha,
           cuenta.name as cuenta,
           r.currency as moneda,
           r.amount::text as monto,
           r.description as descripcion
      from savings_entries r
      join accounts cuenta
        on cuenta.id = r.account_id
       and cuenta.user_id = r.user_id
     where r.user_id = ${usuarioId}::uuid
     order by r.occurred_at asc, r.created_at asc, r.id asc
  `)) as unknown as FilaDeAhorroParaExportar[];

  return filas.map((fila) => ({ ...fila, moneda: fila.moneda.trim() }));
}
