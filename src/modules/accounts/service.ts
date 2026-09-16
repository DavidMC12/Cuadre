/**
 * Reglas de negocio de las cuentas.
 *
 * Nota de arquitectura: crear una cuenta con saldo inicial escribe también en
 * el libro de movimientos, y eso pertenece a otro módulo. Por eso aquí se abre
 * una transacción y se le pide al servicio de movimientos que registre la
 * apertura —nunca se toca su repositorio directamente—. Las dos escrituras
 * entran juntas o no entra ninguna: una cuenta con un saldo inicial a medias
 * sería una cuenta que miente.
 */
import { db } from '../../db/client.js';
import { conflicto, noEncontrado } from '../../http/errores.js';
import { esCero } from '../../shared/schemas.js';
import * as movimientos from '../transactions/service.js';
import * as repositorio from './repository.js';
import type { ActualizarCuenta, CrearCuenta, Cuenta } from './schemas.js';

export async function listarCuentas(
  usuarioId: string,
  incluirArchivadas: boolean,
): Promise<{ data: Cuenta[] }> {
  return { data: await repositorio.listar(usuarioId, incluirArchivadas) };
}

export async function obtenerCuenta(usuarioId: string, cuentaId: string): Promise<Cuenta> {
  const cuenta = await repositorio.obtener(db, usuarioId, cuentaId);
  if (!cuenta) throw noEncontrado('Esa cuenta no existe.');
  return cuenta;
}

export async function crearCuenta(usuarioId: string, datos: CrearCuenta): Promise<Cuenta> {
  const cuentaId = await db.transaction(async (tx) => {
    const id = await repositorio.crear(tx, usuarioId, {
      nombre: datos.name,
      tipo: datos.type,
      moneda: datos.currency,
      esAhorro: datos.isSavings,
      cupo: datos.creditLimit ?? null,
      cuentaVinculadaId: datos.linkedAccountId ?? null,
    });

    // Un saldo inicial de cero no es un movimiento: es no tener nada todavía.
    if (datos.openingBalance && !esCero(datos.openingBalance)) {
      await movimientos.registrarApertura(tx, usuarioId, {
        cuentaId: id,
        monto: datos.openingBalance,
      });
    }

    return id;
  });

  return obtenerCuenta(usuarioId, cuentaId);
}

/**
 * Archivar es esconder, no borrar. La cuenta deja de aparecer y no recibe
 * movimientos nuevos, pero su historia queda intacta y sus movimientos siguen
 * contando en los reportes del pasado.
 */
export async function archivarCuenta(usuarioId: string, cuentaId: string): Promise<Cuenta> {
  const seArchivo = await repositorio.archivar(usuarioId, cuentaId);

  if (!seArchivo) {
    const cuenta = await repositorio.obtener(db, usuarioId, cuentaId);
    if (!cuenta) throw noEncontrado('Esa cuenta no existe.');
    throw conflicto('Esa cuenta ya está archivada.');
  }

  return obtenerCuenta(usuarioId, cuentaId);
}

export async function desarchivarCuenta(usuarioId: string, cuentaId: string): Promise<Cuenta> {
  const existe = await repositorio.desarchivar(usuarioId, cuentaId);
  if (!existe) throw noEncontrado('Esa cuenta no existe.');
  return obtenerCuenta(usuarioId, cuentaId);
}

/**
 * Cambia nombre, cupo y/o cuenta vinculada. `type`, `currency` y el saldo no
 * se pueden editar aquí: el saldo se deriva de los movimientos (nunca se
 * guarda un número suelto), y cambiar de qué está hecha una cuenta o su
 * moneda no es "editarla", es una cuenta distinta.
 */
export async function actualizarCuenta(
  usuarioId: string,
  cuentaId: string,
  cambios: ActualizarCuenta,
): Promise<Cuenta> {
  const existe = await repositorio.actualizar(usuarioId, cuentaId, {
    nombre: cambios.name,
    cupo: cambios.creditLimit,
    cuentaVinculadaId: cambios.linkedAccountId,
  });
  if (!existe) throw noEncontrado('Esa cuenta no existe.');
  return obtenerCuenta(usuarioId, cuentaId);
}

/**
 * Marca o desmarca una cuenta como cuenta de ahorro. Puramente descriptivo:
 * no cambia ninguna otra regla de negocio de la cuenta.
 */
export async function actualizarAhorro(
  usuarioId: string,
  cuentaId: string,
  esAhorro: boolean,
): Promise<Cuenta> {
  const existe = await repositorio.marcarAhorro(usuarioId, cuentaId, esAhorro);
  if (!existe) throw noEncontrado('Esa cuenta no existe.');
  return obtenerCuenta(usuarioId, cuentaId);
}
