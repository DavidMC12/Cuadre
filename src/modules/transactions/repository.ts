/**
 * SQL del libro de movimientos. Nada más: ni reglas de negocio ni HTTP.
 *
 * `usuarioId` es siempre el primer parámetro y nunca es implícito. No existe
 * una consulta aquí que pueda leer o escribir datos de otra persona.
 */
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Ejecutor } from '../../db/client.js';
import { db } from '../../db/client.js';
import { transactions } from '../../db/schema/index.js';
import { ZONA_HORARIA } from '../../shared/zona-horaria.js';
import type { Movimiento } from './schemas.js';

/** Fila tal como sale de la base, antes de darle forma de respuesta. */
interface FilaCruda {
  id: string;
  account_id: string;
  category_id: string | null;
  kind: string;
  amount: string;
  currency: string;
  occurred_at: Date | string;
  description: string | null;
  transfer_group_id: string | null;
  reverses_transaction_id: string | null;
  reversed_by_transaction_id?: string | null;
}

const aIso = (valor: Date | string): string =>
  valor instanceof Date ? valor.toISOString() : new Date(valor).toISOString();

function aMovimiento(fila: FilaCruda): Movimiento {
  return {
    id: fila.id,
    accountId: fila.account_id,
    categoryId: fila.category_id,
    kind: fila.kind as Movimiento['kind'],
    amount: fila.amount,
    currency: fila.currency.trim(),
    occurredAt: aIso(fila.occurred_at),
    description: fila.description,
    transferGroupId: fila.transfer_group_id,
    reversesTransactionId: fila.reverses_transaction_id,
    reversedByTransactionId: fila.reversed_by_transaction_id ?? null,
  };
}

/** Para el RETURNING de un INSERT: una fila recién nacida no puede estar anulada. */
const COLUMNAS = sql`
  id, account_id, category_id, kind, amount::text as amount, currency,
  occurred_at, description, transfer_group_id, reverses_transaction_id`;

/**
 * Para las lecturas. El LEFT JOIN contra la propia tabla responde "¿a este
 * movimiento ya lo anularon?", que es lo que decide si se puede anular.
 */
const LECTURA_CON_ANULACION = sql`
  select m.id, m.account_id, m.category_id, m.kind, m.amount::text as amount,
         m.currency, m.occurred_at, m.description, m.transfer_group_id,
         m.reverses_transaction_id,
         anulacion.id as reversed_by_transaction_id
  from transactions m
  left join transactions anulacion
         on anulacion.reverses_transaction_id = m.id
        and anulacion.user_id = m.user_id`;

// -----------------------------------------------------------------------------

export interface DatosParaRegistrar {
  cuentaId: string;
  monto: string;
  ocurrioEn: string;
  descripcion?: string | null;
  categoriaId?: string | null;
  tipo?: 'opening' | 'standard' | 'transfer';
  grupoDeTransferencia?: string | null;
  anula?: string | null;
}

/**
 * Inserta un movimiento tomando la moneda de la propia cuenta, en una sola
 * sentencia. Así no hay ventana entre "leí la cuenta" y "escribí el movimiento",
 * y la moneda no puede desviarse ni por una carrera entre peticiones.
 *
 * Devuelve null si la cuenta no existe, no es de esta persona, o está
 * archivada. Una cuenta archivada no recibe movimientos nuevos —tampoco
 * anulaciones—: para corregir su historia, primero se desarchiva.
 */
export async function registrar(
  ejecutor: Ejecutor,
  usuarioId: string,
  datos: DatosParaRegistrar,
): Promise<Movimiento | null> {
  const filas = (await ejecutor.execute(sql`
    insert into transactions
      (user_id, account_id, category_id, kind, amount, currency, occurred_at,
       description, transfer_group_id, reverses_transaction_id)
    select ${usuarioId}::uuid,
           ${datos.cuentaId}::uuid,
           ${datos.categoriaId ?? null}::uuid,
           ${datos.tipo ?? 'standard'},
           ${datos.monto}::numeric,
           cuenta.currency,
           ${datos.ocurrioEn}::timestamptz,
           ${datos.descripcion ?? null}::text,
           ${datos.grupoDeTransferencia ?? null}::uuid,
           ${datos.anula ?? null}::uuid
    from accounts cuenta
    where cuenta.id = ${datos.cuentaId}::uuid
      and cuenta.user_id = ${usuarioId}::uuid
      and cuenta.archived_at is null
    returning ${COLUMNAS}
  `)) as unknown as FilaCruda[];

  const fila = filas[0];
  return fila ? aMovimiento(fila) : null;
}

export interface FiltrosDeListado {
  cuentaId?: string | undefined;
  desde?: string | undefined;
  hasta?: string | undefined;
  limite: number;
  cursor?: { ocurrioEn: string; id: string } | undefined;
}

export async function listar(
  usuarioId: string,
  filtros: FiltrosDeListado,
): Promise<{ movimientos: Movimiento[]; hayMas: boolean }> {
  const anulacion = alias(transactions, 'anulacion');

  const condiciones = [eq(transactions.userId, usuarioId)];
  if (filtros.cuentaId) condiciones.push(eq(transactions.accountId, filtros.cuentaId));
  if (filtros.desde) condiciones.push(gte(transactions.occurredAt, new Date(filtros.desde)));
  if (filtros.hasta) condiciones.push(lte(transactions.occurredAt, new Date(filtros.hasta)));
  if (filtros.cursor) {
    // Comparación de tuplas: es exactamente el orden del índice, así que la
    // paginación no se degrada por más páginas que se pidan.
    condiciones.push(
      sql`(${transactions.occurredAt}, ${transactions.id}) < (${filtros.cursor.ocurrioEn}::timestamptz, ${filtros.cursor.id}::uuid)`,
    );
  }

  const filas = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
      kind: transactions.kind,
      amount: transactions.amount,
      currency: transactions.currency,
      occurredAt: transactions.occurredAt,
      description: transactions.description,
      transferGroupId: transactions.transferGroupId,
      reversesTransactionId: transactions.reversesTransactionId,
      reversedByTransactionId: anulacion.id,
    })
    .from(transactions)
    .leftJoin(
      anulacion,
      and(
        eq(anulacion.reversesTransactionId, transactions.id),
        eq(anulacion.userId, transactions.userId),
      ),
    )
    .where(and(...condiciones))
    .orderBy(desc(transactions.occurredAt), desc(transactions.id))
    .limit(filtros.limite + 1);

  const hayMas = filas.length > filtros.limite;

  return {
    hayMas,
    movimientos: filas.slice(0, filtros.limite).map((fila) => ({
      id: fila.id,
      accountId: fila.accountId,
      categoryId: fila.categoryId,
      kind: fila.kind,
      amount: fila.amount,
      currency: fila.currency.trim(),
      occurredAt: fila.occurredAt.toISOString(),
      description: fila.description,
      transferGroupId: fila.transferGroupId,
      reversesTransactionId: fila.reversesTransactionId,
      reversedByTransactionId: fila.reversedByTransactionId,
    })),
  };
}

export async function obtener(
  ejecutor: Ejecutor,
  usuarioId: string,
  movimientoId: string,
): Promise<Movimiento | null> {
  const filas = (await ejecutor.execute(sql`
    ${LECTURA_CON_ANULACION}
    where m.id = ${movimientoId}::uuid and m.user_id = ${usuarioId}::uuid
  `)) as unknown as FilaCruda[];

  const fila = filas[0];
  return fila ? aMovimiento(fila) : null;
}

/** Los dos movimientos de una transferencia entran juntos o no entra ninguno. */
export async function registrarTransferencia(
  usuarioId: string,
  datos: {
    origenId: string;
    destinoId: string;
    monto: string;
    ocurrioEn: string;
    descripcion?: string | null;
  },
): Promise<{ grupoId: string; patas: Movimiento[] } | null> {
  return db.transaction(async (tx) => {
    const grupoId = crypto.randomUUID();
    const comun = {
      ocurrioEn: datos.ocurrioEn,
      descripcion: datos.descripcion ?? null,
      tipo: 'transfer' as const,
      grupoDeTransferencia: grupoId,
    };

    const salida = await registrar(tx, usuarioId, {
      ...comun,
      cuentaId: datos.origenId,
      monto: `-${datos.monto}`,
    });
    if (!salida) return null;

    const entrada = await registrar(tx, usuarioId, {
      ...comun,
      cuentaId: datos.destinoId,
      monto: datos.monto,
    });
    if (!entrada) return null;

    // El disparador que exige que la transferencia cuadre se ejecuta al
    // confirmar. Se adelanta aquí para que el error salga dentro de este
    // `try` y no al cerrar la transacción, donde ya no se puede explicar bien.
    await tx.execute(sql`set constraints all immediate`);

    return { grupoId, patas: [salida, entrada] };
  });
}

/** Las dos patas de una transferencia, para poder anularla completa. */
export async function obtenerPatasDeTransferencia(
  ejecutor: Ejecutor,
  usuarioId: string,
  grupoId: string,
): Promise<Movimiento[]> {
  const filas = (await ejecutor.execute(sql`
    ${LECTURA_CON_ANULACION}
    where m.transfer_group_id = ${grupoId}::uuid and m.user_id = ${usuarioId}::uuid
    order by m.amount asc
  `)) as unknown as FilaCruda[];

  return filas.map((fila) => aMovimiento(fila));
}

/**
 * Corrige la categoria de un movimiento. Es lo UNICO que se puede cambiar de
 * una fila del libro: el monto, la fecha y la cuenta los protege un disparador
 * en la base (ver la migracion 0002).
 *
 * Devuelve null si el movimiento no existe o no es de esta persona.
 */
/** Una fila del archivo exportado, todavía sin traducir a palabras. */
export interface FilaParaExportar {
  id: string;
  fecha: string;
  cuenta: string;
  moneda: string;
  tipo: string;
  categoria: string | null;
  descripcion: string | null;
  monto: string;
  anula: string | null;
  anuladoPor: string | null;
  grupoDeTransferencia: string | null;
}

/**
 * Todo el historial de una persona, del movimiento más viejo al más nuevo, con
 * los nombres de la cuenta y la categoría ya resueltos: el archivo tiene que
 * poder leerse sin la base de datos al lado.
 *
 * La fecha sale en hora de Bogotá, la misma con la que el tablero arma los
 * meses. Si aquí saliera en UTC, un gasto de las 11 de la noche aparecería en
 * el archivo un día después del que muestra la app.
 *
 * Dos movimientos del mismo instante se desempatan por el orden en que se
 * registraron. Sin ese desempate mandaría el id, que es aleatorio, y el mismo
 * historial saldría en distinto orden en cada respaldo.
 *
 * No lleva paginación a propósito: es un respaldo, y un respaldo a la mitad no
 * sirve de respaldo.
 */
export async function listarParaExportar(usuarioId: string): Promise<FilaParaExportar[]> {
  const filas = (await db.execute(sql`
    select m.id,
           to_char(m.occurred_at at time zone ${ZONA_HORARIA}::text, 'YYYY-MM-DD') as fecha,
           cuenta.name as cuenta,
           m.currency as moneda,
           m.kind as tipo,
           categoria.name as categoria,
           m.description as descripcion,
           m.amount::text as monto,
           m.reverses_transaction_id as anula,
           anulacion.id as anulado_por,
           m.transfer_group_id as grupo_de_transferencia
      from transactions m
      join accounts cuenta
        on cuenta.id = m.account_id
       and cuenta.user_id = m.user_id
      left join categories categoria
        on categoria.id = m.category_id
       and categoria.user_id = m.user_id
      left join transactions anulacion
        on anulacion.reverses_transaction_id = m.id
       and anulacion.user_id = m.user_id
     where m.user_id = ${usuarioId}::uuid
     order by m.occurred_at asc, m.created_at asc, m.id asc
  `)) as unknown as {
    id: string;
    fecha: string;
    cuenta: string;
    moneda: string;
    tipo: string;
    categoria: string | null;
    descripcion: string | null;
    monto: string;
    anula: string | null;
    anulado_por: string | null;
    grupo_de_transferencia: string | null;
  }[];

  return filas.map((fila) => ({
    id: fila.id,
    fecha: fila.fecha,
    cuenta: fila.cuenta,
    moneda: fila.moneda.trim(),
    tipo: fila.tipo,
    categoria: fila.categoria,
    descripcion: fila.descripcion,
    monto: fila.monto,
    anula: fila.anula,
    anuladoPor: fila.anulado_por,
    grupoDeTransferencia: fila.grupo_de_transferencia,
  }));
}

export async function recategorizar(
  ejecutor: Ejecutor,
  usuarioId: string,
  movimientoId: string,
  categoriaId: string | null,
): Promise<boolean> {
  const filas = (await ejecutor.execute(sql`
    update transactions
       set category_id = ${categoriaId}::uuid
     where id = ${movimientoId}::uuid
       and user_id = ${usuarioId}::uuid
    returning id
  `)) as unknown as { id: string }[];

  return filas.length > 0;
}
