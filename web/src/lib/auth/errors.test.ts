/**
 * Un código de Neon Auth sin traducir fue justo lo que pasó en el incidente
 * original: el servidor devolvía "VALIDATION_ERROR" y la persona veía el
 * mensaje genérico sin ninguna pista de qué corregir.
 */
import { describe, expect, it } from "vitest";
import { mensajeErrorAuth } from "./errors";

describe("mensajeErrorAuth", () => {
  it("traduce los códigos conocidos", () => {
    expect(mensajeErrorAuth({ code: "VALIDATION_ERROR" })).toBe(
      "Revisa los datos del formulario.",
    );
    expect(mensajeErrorAuth({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "Correo o contraseña incorrectos.",
    );
    expect(mensajeErrorAuth({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" })).toBe(
      "Ya existe una cuenta con ese correo. Prueba entrar en vez de registrarte.",
    );
  });

  it("nunca deja pasar un código o mensaje sin traducir", () => {
    const generico = "Algo salió mal. Inténtalo de nuevo.";
    expect(mensajeErrorAuth({ code: "UN_CODIGO_QUE_NO_EXISTE" })).toBe(generico);
    expect(mensajeErrorAuth({ code: null, message: "Invalid email address" })).toBe(generico);
    expect(mensajeErrorAuth(null)).toBe(generico);
    expect(mensajeErrorAuth(undefined)).toBe(generico);
  });
});
