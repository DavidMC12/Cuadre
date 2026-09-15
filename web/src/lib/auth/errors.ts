/**
 * Traduce los codigos de error que devuelve Neon Auth (Better Auth) a
 * mensajes en espanol que se le pueden mostrar a la persona tal cual.
 */
const MENSAJES_POR_CODIGO: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
  INVALID_EMAIL: "Ese correo no es válido.",
  INVALID_PASSWORD: "Esa contraseña no es válida.",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 8 caracteres.",
  PASSWORD_TOO_LONG: "Esa contraseña es demasiado larga.",
  USER_ALREADY_EXISTS: "Ya existe una cuenta con ese correo.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "Ya existe una cuenta con ese correo. Prueba entrar en vez de registrarte.",
  USER_NOT_FOUND: "No encontramos una cuenta con ese correo.",
  EMAIL_NOT_VERIFIED: "Todavía no verificaste tu correo.",
  // Del enlace para poner una contraseña nueva: ya se usó, o pasó más de una
  // hora desde que se pidió.
  INVALID_TOKEN: "Ese enlace ya no sirve. Puede que haya vencido o que ya lo hayas usado.",
  // El cliente de Neon Auth normaliza el "INVALID_TOKEN" del servidor (que en
  // resetPassword habla del enlace, no de una sesión) a este código de sesión
  // y LANZA en vez de devolver `{ error }` — confirmado probando contra el
  // servidor real. Mismo mensaje que INVALID_TOKEN: para este formulario es
  // exactamente el mismo caso.
  bad_jwt: "Ese enlace ya no sirve. Puede que haya vencido o que ya lo hayas usado.",
  // Red de seguridad: el navegador ya valida el formulario antes de enviarlo,
  // pero el servidor es la última palabra (por ejemplo, un cliente sin
  // JavaScript, o una regla que el navegador no conoce).
  VALIDATION_ERROR: "Revisa los datos del formulario.",
};

const MENSAJE_GENERICO = "Algo salió mal. Inténtalo de nuevo.";

type ErrorAuth = { code?: string | null; message?: string | null } | null | undefined;

/** Mensaje en espanol para un error de `authClient`. Nunca deja pasar un codigo en ingles. */
export function mensajeErrorAuth(error: ErrorAuth): string {
  if (error?.code && MENSAJES_POR_CODIGO[error.code]) {
    return MENSAJES_POR_CODIGO[error.code];
  }
  return MENSAJE_GENERICO;
}

/**
 * Igual que `mensajeErrorAuth`, pero para el otro camino por el que puede
 * fallar una llamada a `authClient`: lanzando una excepción en vez de
 * devolver `{ error }` (pasa, por ejemplo, en `resetPassword` con un token
 * vencido). Si lo lanzado se parece a un error de auth (trae `code`), se
 * busca igual en el mismo diccionario; si no, cae en el mensaje genérico.
 */
export function mensajeErrorAuthLanzado(excepcion: unknown): string {
  if (excepcion && typeof excepcion === "object" && "code" in excepcion) {
    const codigo = (excepcion as { code?: unknown }).code;
    if (typeof codigo === "string") return mensajeErrorAuth({ code: codigo });
  }
  return mensajeErrorAuth(null);
}
