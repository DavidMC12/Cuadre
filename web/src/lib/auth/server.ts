/**
 * Instancia unica de Neon Auth para el servidor.
 *
 * De aca salen tres cosas:
 * - El manejador de la API de auth (`app/api/auth/[...path]/route.ts`).
 * - La proteccion de rutas (`src/proxy.ts`).
 * - Los metodos de servidor (`getSession`, `signIn`, `signUp`...) para
 *   Server Components y Server Actions.
 *
 * `NEON_AUTH_BASE_URL` y `NEON_AUTH_COOKIE_SECRET` viven en el `.env` de la
 * raiz del repo. Next.js solo lee variables de entorno de archivos `.env`
 * dentro de esta carpeta (`web/`), asi que aca se copiaron a `web/.env.local`
 * (sin subir a git). Ver `web/.env.example`.
 */
import { createNeonAuth } from "@neondatabase/auth/next/server";

const baseUrl = process.env.NEON_AUTH_BASE_URL;
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

if (!baseUrl || !cookieSecret) {
  throw new Error(
    "Faltan NEON_AUTH_BASE_URL o NEON_AUTH_COOKIE_SECRET. Revisa web/.env.local (copia web/.env.example)."
  );
}

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: cookieSecret,
  },
});
