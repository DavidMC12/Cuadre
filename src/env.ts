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
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const detalle = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Configuracion invalida. Copia .env.example como .env y completalo:\n${detalle}`,
  );
}

export const env = parsed.data;
export type Env = typeof env;
