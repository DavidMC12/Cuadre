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
