/**
 * Reglas de negocio del libro de movimientos. No sabe nada de HTTP.
 *
 * La base de datos ya impide lo que es imposible (editar un movimiento, una
 * anulación que no cuadra, una transferencia que no suma cero). Lo que se hace
 * aquí es distinto: dar el error entendible ANTES de que Postgres lo rechace,
 * para que la persona lea "el saldo inicial no se anula" y no un mensaje de
 * base de datos.
 */
import { sql } from 'drizzle-orm';
import type { Ejecutor } from '../../db/client.js';
import { db } from '../../db/client.js';
import { conflicto, ErrorDeApp, noEncontrado, reglaViolada } from '../../http/errores.js';
import { negate } from '../../shared/money.js';
import * as repositorio from './repository.js';
import type {
  CrearTransferencia,
  ListarMovimientos,
  Movimiento,
  RegistrarMovimiento,
} from './schemas.js';

// -----------------------------------------------------------------------------
// Paginación

function codificarCursor(movimiento: Movimiento): string {
  return Buffer.from(`${movimiento.occurredAt}|${movimiento.id}`, 'utf8').toString('base64url');
}

function decodificarCursor(cursor: string): { ocurrioEn: string; id: string } {
  const partes = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const [ocurrioEn, id] = partes;

  if (partes.length !== 2 || !ocurrioEn || !id || Number.isNaN(Date.parse(ocurrioEn))) {
    throw new ErrorDeApp('VALIDATION_ERROR', 'El cursor de paginación no es válido.', 400);
  }

  return { ocurrioEn, id };
}

// -----------------------------------------------------------------------------

export async function registrarMovimiento(
  usuarioId: string,
  datos: RegistrarMovimiento,
): Promise<Movimiento> {
  const movimiento = await repositorio.registrar(db, usuarioId, {
    cuentaId: datos.accountId,
    monto: datos.amount,
    ocurrioEn: datos.occurredAt,
    descripcion: datos.description ?? null,
    categoriaId: datos.categoryId ?? null,
  });

  if (!movimiento) {
    throw noEncontrado('Esa cuenta no existe o está archivada.');
  }

  return movimiento;
}

export async function listarMovimientos(
  usuarioId: string,
  filtros: ListarMovimientos,
): Promise<{ data: Movimiento[]; nextCursor: string | null }> {
  const { movimientos, hayMas } = await repositorio.listar(usuarioId, {
    cuentaId: filtros.accountId,
    desde: filtros.from,
    hasta: filtros.to,
    limite: filtros.limit,
    cursor: filtros.cursor ? decodificarCursor(filtros.cursor) : undefined,
  });

  const ultimo = movimientos[movimientos.length - 1];

  return {
    data: movimientos,
    nextCursor: hayMas && ultimo ? codificarCursor(ultimo) : null,
  };
}

export async function obtenerMovimiento(
  usuarioId: string,
  movimientoId: string,
): Promise<Movimiento> {
  const movimiento = await repositorio.obtener(db, usuarioId, movimientoId);
  if (!movimiento) throw noEncontrado('Ese movimiento no existe.');
  return movimiento;
}

/**
 * Anular no es borrar: registra un movimiento opuesto que deja el saldo como
 * estaba, y el original sigue visible en el historial.
 *
 * La anulación lleva la MISMA fecha del movimiento anulado, no la de hoy. Si un
 * gasto de enero estaba mal, en enero no pasó nada: que los reportes de enero
 * cuadren importa más que registrar cuándo se dio cuenta la persona. Cuándo se
 * corrigió queda igual guardado, en `created_at`.
 */
export async function anularMovimiento(
  usuarioId: string,
  movimientoId: string,
): Promise<Movimiento> {
  return db.transaction(async (tx) => {
    const original = await repositorio.obtener(tx, usuarioId, movimientoId);
    if (!original) throw noEncontrado('Ese movimiento no existe.');

    if (original.kind === 'opening') {
      throw reglaViolada(
        'El saldo inicial no se anula. Si quedó mal, registra un movimiento de ajuste por la diferencia.',
      );
    }

    if (original.reversesTransactionId) {
      throw reglaViolada(
        'Ese movimiento ya es una anulación, y una anulación no se anula. Registra un movimiento nuevo.',
      );
    }

    if (original.reversedByTransactionId) {
      throw conflicto('Ese movimiento ya está anulado.');
    }

    if (original.kind === 'transfer') {
      throw reglaViolada(
        'Ese movimiento es parte de una transferencia. Anula la transferencia completa, no una de sus mitades.',
      );
    }

    const anulacion = await repositorio.registrar(tx, usuarioId, {
      cuentaId: original.accountId,
      monto: negate(original.amount),
      ocurrioEn: original.occurredAt,
      descripcion: original.description ? `Anulación de: ${original.description}` : 'Anulación',
      tipo: original.kind,
      anula: original.id,
    });

    if (!anulacion) {
      throw reglaViolada(
        'La cuenta de ese movimiento está archivada. Desarchívala para poder corregir su historial.',
      );
    }

    return anulacion;
  });
}

// -----------------------------------------------------------------------------

export async function crearTransferencia(
  usuarioId: string,
  datos: CrearTransferencia,
): Promise<{ transferGroupId: string; legs: Movimiento[] }> {
  const resultado = await repositorio.registrarTransferencia(usuarioId, {
    origenId: datos.fromAccountId,
    destinoId: datos.toAccountId,
    monto: datos.amount,
    ocurrioEn: datos.occurredAt,
    descripcion: datos.description ?? null,
  });

  if (!resultado) {
    throw noEncontrado('Alguna de las dos cuentas no existe o está archivada.');
  }

  return { transferGroupId: resultado.grupoId, legs: resultado.patas };
}

/**
 * Deshacer una transferencia son dos anulaciones que entran juntas y forman su
 * propia transferencia en sentido contrario. Si solo se anulara una mitad, el
 * grupo quedaría descuadrado y la base rechazaría la operación completa.
 */
export async function anularTransferencia(
  usuarioId: string,
  grupoId: string,
): Promise<{ transferGroupId: string; legs: Movimiento[] }> {
  return db.transaction(async (tx) => {
    const patas = await repositorio.obtenerPatasDeTransferencia(tx, usuarioId, grupoId);

    if (patas.length === 0) throw noEncontrado('Esa transferencia no existe.');
    if (patas.some((pata) => pata.reversesTransactionId)) {
      throw reglaViolada('Esa transferencia ya es la anulación de otra.');
    }
    if (patas.some((pata) => pata.reversedByTransactionId)) {
      throw conflicto('Esa transferencia ya está anulada.');
    }

    const grupoNuevo = crypto.randomUUID();
    const anulaciones: Movimiento[] = [];

    for (const pata of patas) {
      const anulacion = await repositorio.registrar(tx, usuarioId, {
        cuentaId: pata.accountId,
        monto: negate(pata.amount),
        ocurrioEn: pata.occurredAt,
        descripcion: pata.description ? `Anulación de: ${pata.description}` : 'Anulación',
        tipo: 'transfer',
        grupoDeTransferencia: grupoNuevo,
        anula: pata.id,
      });

      if (!anulacion) {
        throw reglaViolada(
          'Alguna de las cuentas de esa transferencia está archivada. Desarchívala para poder corregir su historial.',
        );
      }

      anulaciones.push(anulacion);
    }

    // El disparador que exige que la transferencia cuadre corre al confirmar. Se
    // adelanta para que, si algo no cuadra, el error salga aqui y no al cerrar.
    await tx.execute(sql`set constraints all immediate`);

    return { transferGroupId: grupoNuevo, legs: anulaciones };
  });
}

// -----------------------------------------------------------------------------

/**
 * El saldo con el que arranca una cuenta.
 *
 * Lo llama el modulo de cuentas pasandole SU transaccion, para que la cuenta y
 * su apertura entren juntas. Vive aqui, y no alla, porque escribir en el libro
 * de movimientos es responsabilidad de este modulo y de ningun otro.
 */
export async function registrarApertura(
  ejecutor: Ejecutor,
  usuarioId: string,
  datos: { cuentaId: string; monto: string; ocurrioEn?: string },
): Promise<Movimiento> {
  const apertura = await repositorio.registrar(ejecutor, usuarioId, {
    cuentaId: datos.cuentaId,
    monto: datos.monto,
    ocurrioEn: datos.ocurrioEn ?? new Date().toISOString(),
    descripcion: 'Saldo inicial',
    tipo: 'opening',
  });

  if (!apertura) throw noEncontrado('Esa cuenta no existe o esta archivada.');
  return apertura;
}
