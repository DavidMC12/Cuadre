/**
 * Da rol de administrador. Reversible: poner 'user' lo deshace.
 *
 * `davidmadridcardozo@gmail.com` es el dueño, permanente.
 * `prueba-panel@ejemplo.com` es temporal, solo para poder probar el panel sin
 * la contraseña del dueño; se le quita antes de terminar.
 */
import postgres from 'postgres';

process.loadEnvFile('.env');

const sql = postgres(process.env['DATABASE_URL']!, { max: 1, prepare: false });

const A_ADMIN = ['davidmadridcardozo@gmail.com', 'prueba-panel@ejemplo.com'];

try {
  const cambiados = await sql`
    update neon_auth."user"
       set role = 'admin'
     where email = any(${A_ADMIN})
    returning email, role
  `;

  console.log('AHORA SON ADMIN:');
  for (const p of cambiados) console.log(`  ${p['email']} -> ${p['role']}`);

  const todos = await sql`
    select email, role from neon_auth."user" order by "createdAt"
  `;
  console.log('\nESTADO COMPLETO:');
  for (const p of todos) console.log(`  ${p['email']} | ${p['role']}`);
} finally {
  await sql.end();
}
