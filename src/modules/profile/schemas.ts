/**
 * Validación del perfil. El correo NO aparece entre los campos editables y no
 * es un olvido: quien manda sobre el correo es Neon Auth, y dejar que se
 * cambiara aquí haría que la app y el proveedor de identidad contaran dos
 * historias distintas sobre la misma persona.
 */
import { z } from 'zod';
import { START_PAGES } from '../../db/schema/users.js';
import { MonedaSchema } from '../../shared/schemas.js';

// -----------------------------------------------------------------------------
// Peticiones

const NombreSchema = z
  .string()
  .trim()
  .min(1, 'no puede quedar en blanco')
  .max(100, 'no puede pasar de 100 caracteres');

/**
 * `strictObject` para que mandar un campo que no existe —`email`, por ejemplo—
 * sea un error visible y no un cambio que se ignora en silencio.
 *
 * Los tres campos son opcionales, pero mandar el objeto vacío no: una petición
 * que no pide ningún cambio casi siempre es un error de quien la escribió, y
 * responder 200 la dejaría creyendo que guardó algo.
 */
export const ActualizarPerfilSchema = z
  .strictObject({
    displayName: NombreSchema.optional(),
    /** `null` borra la preferencia y vuelve a deducir la moneda de las cuentas. */
    defaultCurrency: MonedaSchema.nullish(),
    startPage: z.enum(START_PAGES).optional(),
  })
  .refine((datos) => Object.values(datos).some((valor) => valor !== undefined), {
    message: 'No mandaste ningún cambio.',
  });

// -----------------------------------------------------------------------------
// Respuestas

export const PerfilSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  createdAt: z.string(),
  defaultCurrency: z.string().nullable(),
  startPage: z.enum(START_PAGES),
  /**
   * Si esta persona administra el sistema. No sale de la tabla `users` sino de
   * la sesión, porque los permisos los manda el proveedor de identidad; aquí
   * solo viaja para que las pantallas sepan si mostrar la entrada al panel.
   */
  isAdmin: z.boolean(),
  /**
   * Si esta sesión es la de alguien a quien un administrador está viendo.
   *
   * Viaja junto al perfil, y no en una consulta aparte, para que el aviso de
   * la pantalla y el correo que muestra salgan del mismo dato: dos consultas
   * distintas pueden desincronizarse, y el precio de que se desincronicen es
   * escribir un movimiento en el libro de la persona equivocada.
   */
  isImpersonated: z.boolean(),
});

export const UnPerfilSchema = z.object({ data: PerfilSchema });

export type ActualizarPerfil = z.infer<typeof ActualizarPerfilSchema>;
export type Perfil = z.infer<typeof PerfilSchema>;

/**
 * Lo que de verdad está guardado en la tabla. Lo que dice la sesión —si
 * administras y si te están viendo— queda fuera: lo añade la capa HTTP al
 * responder.
 */
export type PerfilGuardado = Omit<Perfil, 'isAdmin' | 'isImpersonated'>;
