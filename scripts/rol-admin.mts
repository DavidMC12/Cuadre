/**
 * Da o quita el rol de administrador a una cuenta.
 *
 *   npm run admin -- correo@ejemplo.com admin
 *   npm run admin -- correo@ejemplo.com user
 *
 * Existe porque el primer administrador no se puede nombrar desde la app: para
 * entrar al panel hay que ser administrador, y para ser administrador alguien
 * tiene que nombrarte. Esto rompe ese círculo, y por eso vive fuera de la app
 * y se corre a mano.
 *
 * Cambia una sola columna (`role`) en la tabla de Neon Auth. Es reversible:
 * volver a correrlo con 'user' lo deshace. No toca ningún dato de Cuadre.
 */
import postgres from 'postgres';

process.loadEnvFile('.env');

const [, , correo, rol] = process.argv;

if (!correo || (rol !== 'admin' && rol !== 'user')) {
  console.error('Uso: npm run admin -- <correo> <admin|user>');
  process.exit(1);
}

const sql = postgres(process.env['DATABASE_URL']!, { max: 1, prepare: false });

try {
  const cambiados = await sql`
    update neon_auth."user"
       set role = ${rol}
     where email = ${correo.toLowerCase()}
    returning email, role
  `;

  if (cambiados.length === 0) {
    console.error(`No existe ninguna cuenta con el correo ${correo}.`);
    process.exit(1);
  }

  console.log(`Listo: ${cambiados[0]!['email']} ahora tiene rol "${cambiados[0]!['role']}".`);
} finally {
  await sql.end();
}
