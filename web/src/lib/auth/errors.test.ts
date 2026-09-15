/**
 * Un código de Neon Auth sin traducir fue justo lo que pasó en el incidente
 * original: el servidor devolvía "VALIDATION_ERROR" y la persona veía el
 * mensaje genérico sin ninguna pista de qué corregir.
 */
import { describe, expect, it } from "vitest";
import { mensajeErrorAuth, mensajeErrorAuthLanzado } from "./errors";

describe("mensajeErrorAuth", () => {
  it("traduce los códigos conocidos", () => {
    expect(mensajeErrorAuth({ code: "VALIDATION_ERROR" })).toBe("Revisa los datos del formulario.");
    expect(mensajeErrorAuth({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "Correo o contraseña incorrectos."
    );
    expect(mensajeErrorAuth({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" })).toBe(
      "Ya existe una cuenta con ese correo. Prueba entrar en vez de registrarte."
    );
  });

  it("traduce los códigos en minúscula con los que en la práctica llega el error", () => {
    // authClient normaliza el código original de Better Auth a esta otra
    // forma antes de lanzarlo; ver el comentario junto al diccionario.
    expect(mensajeErrorAuth({ code: "invalid_credentials" })).toBe(
      "Correo o contraseña incorrectos."
    );
    expect(mensajeErrorAuth({ code: "user_already_exists" })).toBe(
      "Ya existe una cuenta con ese correo."
    );
    expect(mensajeErrorAuth({ code: "over_request_rate_limit" })).toBe(
      "Demasiadas peticiones. Espera un momento."
    );
  });

  it("nunca traduce user_not_found: delataría quién tiene cuenta en recuperar-contrasena", () => {
    const generico = "Algo salió mal. Inténtalo de nuevo.";
    expect(mensajeErrorAuth({ code: "USER_NOT_FOUND" })).toBe(generico);
    expect(mensajeErrorAuth({ code: "user_not_found" })).toBe(generico);
  });

  it("nunca deja pasar un código o mensaje sin traducir", () => {
    const generico = "Algo salió mal. Inténtalo de nuevo.";
    expect(mensajeErrorAuth({ code: "UN_CODIGO_QUE_NO_EXISTE" })).toBe(generico);
    expect(mensajeErrorAuth({ code: null, message: "Invalid email address" })).toBe(generico);
    expect(mensajeErrorAuth(null)).toBe(generico);
    expect(mensajeErrorAuth(undefined)).toBe(generico);
  });
});

describe("mensajeErrorAuthLanzado", () => {
  it("lee el código de una excepción con forma de error de auth", () => {
    expect(mensajeErrorAuthLanzado({ code: "invalid_credentials" })).toBe(
      "Correo o contraseña incorrectos."
    );
  });

  it("usa la sobrescritura de la pantalla en vez del diccionario compartido", () => {
    // bad_jwt no tiene entrada en el diccionario compartido a propósito
    // (significa cosas distintas según quién llama): sin `sobrescrituras`
    // cae en el mensaje genérico...
    expect(mensajeErrorAuthLanzado({ code: "bad_jwt" })).toBe(
      "Algo salió mal. Inténtalo de nuevo."
    );
    // ...y con `sobrescrituras`, gana la de quien llama.
    expect(
      mensajeErrorAuthLanzado({ code: "bad_jwt" }, { bad_jwt: "Ese enlace ya no sirve." })
    ).toBe("Ese enlace ya no sirve.");
  });

  it("cae en el mensaje genérico si lo lanzado no se parece a un error de auth", () => {
    const generico = "Algo salió mal. Inténtalo de nuevo.";
    expect(mensajeErrorAuthLanzado(new Error("red caída"))).toBe(generico);
    expect(mensajeErrorAuthLanzado("un texto cualquiera")).toBe(generico);
    expect(mensajeErrorAuthLanzado(null)).toBe(generico);
    expect(mensajeErrorAuthLanzado({ mensaje: "sin campo code" })).toBe(generico);
  });
});
