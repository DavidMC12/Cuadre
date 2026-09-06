import { z } from 'zod';

// Node 22+ lee el .env sin dependencias externas.
// Si el archivo no existe (por ejemplo en CI), se usan las variables del sistema.
try {
  process.loadEnvFile('.env');
} catch {
  // sin .env: seguimos con process.env tal cual
}

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'es obligatoria')
    .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
      message: 'debe empezar con postgres:// o postgresql://',
    }),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().max(65535).default(3001),

  /**
   * Lista blanca de sitios que pueden llamar a la API, separados por comas.
   * Nunca `*`: eso dejaría que cualquier página web hiciera peticiones con la
   * sesión de la persona.
   */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((valor) =>
      valor
        .split(',')
        .map((origen) => origen.trim())
        .filter(Boolean),
    )
    .refine((origenes) => origenes.length > 0 && !origenes.includes('*'), {
      message: 'debe listar al menos un sitio concreto, y nunca "*"',
    }),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const detalle = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Configuracion invalida. Copia .env.example como .env y completalo:\n${detalle}`);
}

export const env = parsed.data;
export type Env = typeof env;
