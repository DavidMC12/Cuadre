/**
 * Validación del módulo de administración.
 *
 * La lista de usuarios NO sale de aquí: la sirve Neon Auth, que es quien sabe
 * quién puede entrar y ya valida el rol por su cuenta. Este módulo solo se
 * ocupa de dejar rastro de a quién se suplantó, que es lo que Neon Auth no
 * guarda en un formato que esta app pueda leer después.
 */
import { z } from 'zod';

export const RegistrarSuplantacionSchema = z.strictObject({
  /** El identificador de la persona en el proveedor de identidad. */
  targetAuthSubject: z.string().trim().min(1).max(200),
  targetEmail: z.email().max(320),
});

export const SuplantacionSchema = z.object({
  id: z.uuid(),
  targetAuthSubject: z.string(),
  targetEmail: z.string(),
  startedAt: z.string(),
});

export const UnaSuplantacionSchema = z.object({ data: SuplantacionSchema });
export const ListaDeSuplantacionesSchema = z.object({ data: z.array(SuplantacionSchema) });

export const ListarSuplantacionesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type RegistrarSuplantacion = z.infer<typeof RegistrarSuplantacionSchema>;
export type Suplantacion = z.infer<typeof SuplantacionSchema>;
