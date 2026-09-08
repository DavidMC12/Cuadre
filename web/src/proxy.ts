/**
 * Protege la app: quien no ha entrado y abre cualquier pantalla termina en
 * /entrar. (En Next.js 16 este archivo reemplaza a `middleware.ts`.)
 *
 * `auth.middleware()` solo sabe dejar pasar su propio `loginUrl` (acá
 * `/entrar`); no conoce `/registrarse`, ni los recursos de la PWA. Por eso el
 * `matcher` de abajo saca esas rutas del proxy por completo, en vez de
 * dejarlas "permitidas" adentro: así siguen sirviéndose aunque no haya
 * sesión. El camino de vuelta -- alguien con sesión que abre /entrar o
 * /registrarse -- lo resuelve cada pantalla por su cuenta (redirige al
 * tablero si ya hay sesión), porque el proxy ni siquiera corre ahí.
 *
 * `/salud` y `/api/v1/*` tampoco pasan por acá: `vercel.json` los reenvia
 * directo al proyecto de la API (ver DESPLIEGUE.md), que hace su propia
 * verificación de sesión. Si el proxy los interceptara, redirigiria a
 * /entrar (un 307 con HTML) en vez de dejar pasar la respuesta real de la
 * API -- rompiendo tanto el monitor de salud como cualquier llamada de las
 * pantallas sin sesión (la API responde 401 en JSON, no una redirección).
 */
import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/entrar" });

export const config = {
  matcher: [
    "/((?!api/auth|api/v1|salud|entrar|registrarse|manifest\\.webmanifest|icons|icon|apple-icon|favicon\\.ico|_next/static|_next/image).*)",
  ],
};
