/**
 * Reglas del perfil.
 *
 * Es el módulo más aburrido de la app y así debe quedarse: aquí no hay plata.
 * La moneda por defecto solo decide qué se propone en un formulario; no cambia
 * ni un centavo de lo que ya está registrado.
 */
import { noEncontrado } from '../../http/errores.js';
import * as repositorio from './repository.js';
import type { ActualizarPerfil, PerfilGuardado } from './schemas.js';

const NO_EXISTE = 'No encontramos tu perfil.';

export async function obtenerPerfil(usuarioId: string): Promise<PerfilGuardado> {
  const perfil = await repositorio.obtener(usuarioId);
  if (!perfil) throw noEncontrado(NO_EXISTE);
  return perfil;
}

export async function actualizarPerfil(
  usuarioId: string,
  datos: ActualizarPerfil,
): Promise<PerfilGuardado> {
  const perfil = await repositorio.actualizar(usuarioId, datos);
  if (!perfil) throw noEncontrado(NO_EXISTE);
  return perfil;
}
