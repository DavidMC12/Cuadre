import { describe, expect, it } from "vitest";
import { decidirInicio } from "./inicio";

describe("al abrir la app", () => {
  it("espera mientras no sepa a dónde ir", () => {
    expect(decidirInicio({ yaSeAbrio: false, buscandoPerfil: true, pantalla: undefined })).toEqual({
      accion: "esperar",
    });
  });

  it("lleva a la pantalla que la persona eligió", () => {
    expect(
      decidirInicio({ yaSeAbrio: false, buscandoPerfil: false, pantalla: "movimientos" })
    ).toEqual({ accion: "irse", pantalla: "movimientos" });
  });

  it("quien eligió el resumen ya está donde quería", () => {
    expect(decidirInicio({ yaSeAbrio: false, buscandoPerfil: false, pantalla: "resumen" })).toEqual(
      { accion: "quedarse" }
    );
  });
});

describe("una vez abierta, no vuelve a mover a nadie", () => {
  it("volver al resumen desde el menú no rebota", () => {
    expect(decidirInicio({ yaSeAbrio: true, buscandoPerfil: false, pantalla: "cuentas" })).toEqual({
      accion: "quedarse",
    });
  });

  it("tampoco espera: la pantalla se pinta de una", () => {
    expect(decidirInicio({ yaSeAbrio: true, buscandoPerfil: true, pantalla: undefined })).toEqual({
      accion: "quedarse",
    });
  });
});

describe("si el perfil no se pudo leer", () => {
  it("deja a la persona donde está en vez de adivinar", () => {
    expect(decidirInicio({ yaSeAbrio: false, buscandoPerfil: false, pantalla: undefined })).toEqual(
      { accion: "quedarse" }
    );
  });

  it("y el perfil que llega tarde ya no da un salto de pantalla", () => {
    // Primero falla: eso gasta el momento de abrir la app...
    const alFallar = decidirInicio({
      yaSeAbrio: false,
      buscandoPerfil: false,
      pantalla: undefined,
    });
    expect(alFallar).toEqual({ accion: "quedarse" });

    // ...y cuando el perfil llega —al volver a la pestaña, por ejemplo—, ya no
    // se mueve a nadie de sitio en plena sesión.
    expect(decidirInicio({ yaSeAbrio: true, buscandoPerfil: false, pantalla: "cuentas" })).toEqual({
      accion: "quedarse",
    });
  });
});
