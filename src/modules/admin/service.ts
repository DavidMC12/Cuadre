/**
 * Reglas de la administración.
 *
 * Este módulo no lee ni escribe la plata de nadie, y eso es a propósito. Para
 * ver las cuentas de otra persona, un administrador se convierte en ella con
 * Neon Auth y usa la app tal cual: así toda consulta sigue pidiendo su
 * `user_id`, igual que siempre, y la regla de que nadie ve los datos ajenos
 * queda intacta. Unas pantallas de administración que leyeran movimientos de
 * cualquiera serían la excepción a esa regla, y las excepciones a esa regla
 * son por donde se cuela una fuga.
 */
import { sinPermiso } from '../../http/errores.js';
import * as repositorio from './repository.js';
import type { RegistrarSuplantacion, Suplantacion } from './schemas.js';

/**
 * Corta la petición si quien pide no administra el sistema.
 *
 * Mientras un administrador está viendo la app como otra persona, su sesión es
 * la de ella y `esAdmin` vale false. Eso no es un descuido: suplantar no debe
 * dar acceso al panel, o desde la cuenta de alguien más se podría saltar a una
 * tercera sin que nada quedara registrado.
 */
export function exigirAdmin(esAdmin: boolean): void {
  if (!esAdmin) throw sinPermiso();
}

export async function registrarSuplantacion(
  adminUsuarioId: string,
  esAdmin: boolean,
  datos: RegistrarSuplantacion,
): Promise<Suplantacion> {
  exigirAdmin(esAdmin);

  return repositorio.registrar(adminUsuarioId, {
    targetAuthSubject: datos.targetAuthSubject,
    targetEmail: datos.targetEmail,
  });
}

export async function listarSuplantaciones(
  adminUsuarioId: string,
  esAdmin: boolean,
  limite: number,
): Promise<{ data: Suplantacion[] }> {
  exigirAdmin(esAdmin);

  return { data: await repositorio.listarDe(adminUsuarioId, limite) };
}
