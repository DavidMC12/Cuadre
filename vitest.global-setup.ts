/**
 * Antes de las pruebas: una copia desechable de la base. Después: se borra.
 *
 * Se ejecuta una sola vez por tanda, antes de que arranque cualquier archivo de
 * pruebas, y deja la cadena de conexión en DATABASE_URL para que los procesos
 * de trabajo la hereden.
 *
 * Sin NEON_API_KEY las pruebas siguen corriendo contra DATABASE_URL, avisando.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import {
  borrarRama,
  borrarRamasHuerfanas,
  credencialesDeNeon,
  crearRamaDePruebas,
} from './src/db/rama-de-pruebas.js';

const aviso = (mensaje: string) => console.log(`[pruebas] ${mensaje}`);

export default async function preparar(): Promise<(() => Promise<void>) | void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // sin .env: se usan las variables del sistema
  }

  const credenciales = credencialesDeNeon();

  if (!credenciales) {
    aviso('Sin NEON_API_KEY: se usa la base de DATABASE_URL, y lo que escriban');
    aviso('las pruebas se queda ahi (los movimientos no se pueden borrar).');
    return;
  }

  const huerfanas = await borrarRamasHuerfanas(credenciales);
  if (huerfanas > 0) aviso(`Se limpiaron ${huerfanas} ramas de tandas interrumpidas.`);

  const rama = await crearRamaDePruebas(credenciales);
  process.env['DATABASE_URL'] = rama.url;
  aviso(`Rama efimera ${rama.nombre} creada.`);

  // Aplicar las migraciones sirve de verificacion: la rama nace como copia de
  // la principal, asi que si aqui falta alguna es que el repositorio y la base
  // se separaron.
  // onnotice callado: la rama ya trae la tabla de migraciones por ser copia,
  // y Postgres lo avisa con un NOTICE que aqui solo seria ruido.
  const cliente = postgres(rama.url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(cliente), { migrationsFolder: './drizzle' });
  } finally {
    await cliente.end();
  }

  return async () => {
    await borrarRama(credenciales, rama.id);
    aviso(`Rama ${rama.nombre} borrada.`);
  };
}
