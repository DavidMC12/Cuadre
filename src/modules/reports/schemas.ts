/**
 * Validación en el borde de los reportes.
 *
 * Todos los totales salen como TEXTO, igual que los montos: un `number` de
 * JavaScript ya perdió precisión antes de llegar a la pantalla.
 */
import { z } from 'zod';
import { MonedaSchema } from '../../shared/schemas.js';

/** Ingresos o gastos. Es el lado del reporte que se está mirando. */
export const TIPOS_DE_CATEGORIA = ['income', 'expense'] as const;
export const TipoDeCategoriaSchema = z.enum(TIPOS_DE_CATEGORIA);

/** Un mes calendario, como "2026-09". */
export const MesSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'debe ser un mes como "2026-09"');

// -----------------------------------------------------------------------------
// Peticiones

export const ResumenDelMesSchema = z.object({
  month: MesSchema,
  currency: MonedaSchema,
});

export const PorCategoriaSchema = z.object({
  month: MesSchema,
  currency: MonedaSchema,
  /** Por defecto los gastos: es la torta que el tablero muestra primero. */
  kind: TipoDeCategoriaSchema.default('expense'),
});

export const TendenciaSchema = z.object({
  /** Hasta dos años hacia atrás; más que eso no cabe en una gráfica. */
  months: z.coerce.number().int().min(1).max(24).default(6),
  currency: MonedaSchema,
});

// -----------------------------------------------------------------------------
// Respuestas

export const MonedasSchema = z.object({ data: z.array(z.string()) });

export const RespuestaDeResumenSchema = z.object({
  data: z.object({
    month: z.string(),
    currency: z.string(),
    /** Cuánto entró. Texto, para no perder precisión. */
    income: z.string(),
    /** Cuánto salió, en positivo: es "cuánto gastaste", no un saldo. */
    expense: z.string(),
    /** `income` − `expense`. */
    net: z.string(),
  }),
});

export const RespuestaPorCategoriaSchema = z.object({
  data: z.array(
    z.object({
      /** Nulo es el balde de "sin categoría"; el nombre lo pone el frontend. */
      categoryId: z.uuid().nullable(),
      categoryName: z.string().nullable(),
      total: z.string(),
    }),
  ),
});

export const RespuestaDeTendenciaSchema = z.object({
  data: z.array(
    z.object({
      month: z.string(),
      income: z.string(),
      expense: z.string(),
    }),
  ),
});

export type ResumenDelMes = z.infer<typeof ResumenDelMesSchema>;
export type PorCategoria = z.infer<typeof PorCategoriaSchema>;
export type Tendencia = z.infer<typeof TendenciaSchema>;
export type TipoDeCategoria = z.infer<typeof TipoDeCategoriaSchema>;
