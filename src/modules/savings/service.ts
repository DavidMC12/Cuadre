/**
 * Reglas de negocio de los registros manuales de ahorro. No sabe nada de HTTP.
 *
 * El repositorio solo escribe y devuelve `null` cuando no pudo (la cuenta no
 * existe, no es de la persona, está archivada o no está marcada como de
 * ahorro). Aquí se distingue el motivo mirando la cuenta con el SERVICE de
 * cuentas —nunca su repositorio— para dar un mensaje llano.
 *
 * Recordatorio: un registro de ahorro NO mueve plata de ninguna cuenta. El
 * saldo y lo ahorrado son cosas distintas; esto solo anota lo segundo.
 */
import { db } from '../../db/client.js';
import { reglaViolada } from '../../http/errores.js';
import * as cuentasService from '../accounts/service.js';
import * as repositorio from './repository.js';
import type { ListarAhorros, RegistrarAhorro, RegistroDeAhorro } from './schemas.js';

export async function registrarAhorro(
  usuarioId: string,
  datos: RegistrarAhorro,
): Promise<RegistroDeAhorro> {
  const registro = await repositorio.registrar(db, usuarioId, {
    cuentaId: datos.accountId,
    monto: datos.amount,
    ocurrioEn: datos.occurredAt ?? new Date().toISOString(),
    descripcion: datos.description ?? null,
  });

  if (registro) return registro;

  // El repositorio no dijo por qué. Se le pregunta al service de cuentas: si la
  // cuenta no existe o no es de esta persona, responde 404 él mismo. Si existe,
  // solo quedan dos razones, y la persona merece saber cuál.
  const cuenta = await cuentasService.obtenerCuenta(usuarioId, datos.accountId);

  if (cuenta.archivedAt) {
    throw reglaViolada('Esa cuenta está archivada. Desarchívala para anotar ahorro.');
  }

  throw reglaViolada('Solo puedes anotar ahorro en una cuenta marcada como de ahorro.');
}

export async function listarAhorros(
  usuarioId: string,
  filtros: ListarAhorros,
): Promise<{ data: RegistroDeAhorro[] }> {
  // La cuenta tiene que ser de esta persona: si no existe o es ajena, 404.
  // No se exige que sea de ahorro: listar lo que ya está anotado no depende de
  // la etiqueta de hoy.
  await cuentasService.obtenerCuenta(usuarioId, filtros.accountId);

  return {
    data: await repositorio.listarDeUnaCuenta(db, usuarioId, filtros.accountId, filtros.limit),
  };
}
