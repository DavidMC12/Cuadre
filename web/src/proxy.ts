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
 */
import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/entrar" });

export const config = {
  matcher: [
    "/((?!api/auth|entrar|registrarse|manifest\\.webmanifest|icons|icon|apple-icon|favicon\\.ico|_next/static|_next/image).*)",
  ],
};
