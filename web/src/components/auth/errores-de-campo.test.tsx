// @vitest-environment jsdom
/**
 * El error de autenticación tiene que marcar (y describir) solo el campo que
 * de verdad falló. Un error general —credenciales inválidas, red— no marca
 * ninguno; un error de correo o de contraseña marca el suyo y no el otro.
 *
 * Estas pruebas anclan eso en los cuatro formularios: sin ellas, volver a
 * poner `aria-invalid={Boolean(error)}` en cada campo no rompería nada más.
 * También anclan que sin error el atributo NO se emite: un
 * `aria-invalid="false"` fijo era ruido en el árbol accesible.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { FormularioEntrar } from "./formulario-entrar";
import { FormularioRegistro } from "./formulario-registro";
import { FormularioRecuperar } from "./formulario-recuperar";
import { FormularioRestablecer } from "./formulario-restablecer";

const auth = vi.hoisted(() => ({
  entrar: vi.fn(),
  registrar: vi.fn(),
  recuperar: vi.fn(),
  restablecer: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    signIn: { email: auth.entrar },
    signUp: { email: auth.registrar },
    requestPasswordReset: auth.recuperar,
    resetPassword: auth.restablecer,
  },
}));

afterEach(() => {
  cleanup();
  auth.entrar.mockReset();
  auth.registrar.mockReset();
  auth.recuperar.mockReset();
  auth.restablecer.mockReset();
});

/** El camino que devuelve `{ error }`. */
function devolverError(fn: ReturnType<typeof vi.fn>, error: unknown) {
  fn.mockResolvedValue({ error });
}

/** El camino que LANZA (el habitual contra el servidor real). */
function lanzarError(fn: ReturnType<typeof vi.fn>, error: unknown) {
  fn.mockRejectedValue(error);
}

async function esperarAlerta(texto: string) {
  const alerta = await screen.findByRole("alert");
  expect(alerta).toHaveTextContent(texto);
  return alerta;
}

describe("FormularioEntrar", () => {
  function montarYEnviar() {
    render(<FormularioEntrar />);
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secreta123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  }

  it("credenciales inválidas: error general, ningún campo inválido y ambos descritos", async () => {
    devolverError(auth.entrar, { code: "invalid_credentials" });
    montarYEnviar();

    const alerta = await esperarAlerta("Correo o contraseña incorrectos.");
    const correo = screen.getByLabelText("Correo");
    const contrasena = screen.getByLabelText("Contraseña");

    expect(correo).not.toHaveAttribute("aria-invalid");
    expect(contrasena).not.toHaveAttribute("aria-invalid");
    expect(correo).toHaveAttribute("aria-describedby", alerta.id);
    expect(contrasena).toHaveAttribute("aria-describedby", alerta.id);
  });

  it("un código del correo marca solo el correo", async () => {
    devolverError(auth.entrar, { code: "email_address_invalid" });
    montarYEnviar();

    const alerta = await esperarAlerta("Ese correo no es válido.");
    const correo = screen.getByLabelText("Correo");
    const contrasena = screen.getByLabelText("Contraseña");

    expect(correo).toHaveAttribute("aria-invalid", "true");
    expect(correo).toHaveAttribute("aria-describedby", alerta.id);
    expect(contrasena).not.toHaveAttribute("aria-invalid");
    expect(contrasena).not.toHaveAttribute("aria-describedby");
  });

  it("un código de la contraseña marca solo la contraseña", async () => {
    devolverError(auth.entrar, { code: "weak_password" });
    montarYEnviar();

    const alerta = await esperarAlerta("Esa contraseña no sirve: prueba con un largo distinto.");
    const correo = screen.getByLabelText("Correo");
    const contrasena = screen.getByLabelText("Contraseña");

    expect(contrasena).toHaveAttribute("aria-invalid", "true");
    expect(contrasena).toHaveAttribute("aria-describedby", alerta.id);
    expect(correo).not.toHaveAttribute("aria-invalid");
    expect(correo).not.toHaveAttribute("aria-describedby");
  });

  it("el alfabeto en MAYÚSCULAS mapea el mismo campo", async () => {
    // Neon Auth normaliza los códigos a minúsculas, pero la forma devuelta
    // puede traerlos en MAYÚSCULAS: el mapeo cubre los dos alfabetos.
    devolverError(auth.entrar, { code: "INVALID_PASSWORD" });
    montarYEnviar();

    const alerta = await esperarAlerta("Esa contraseña no es válida.");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("aria-describedby", alerta.id);
    expect(screen.getByLabelText("Correo")).not.toHaveAttribute("aria-invalid");
  });

  it("el camino que lanza también decide el campo", async () => {
    // Contra el servidor real, `authClient` lanza en vez de devolver
    // `{ error }` (ver auth/errors.ts): el mismo mapeo tiene que aplicar.
    lanzarError(auth.entrar, { code: "email_address_invalid" });
    montarYEnviar();

    const alerta = await esperarAlerta("Ese correo no es válido.");
    expect(screen.getByLabelText("Correo")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Correo")).toHaveAttribute("aria-describedby", alerta.id);
    expect(screen.getByLabelText("Contraseña")).not.toHaveAttribute("aria-invalid");
  });
});

describe("FormularioRegistro", () => {
  function montarYEnviar() {
    render(<FormularioRegistro />);
    fireEvent.change(screen.getByLabelText("Nombre completo"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secreta123" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
  }

  it("correo ya existente marca solo el correo", async () => {
    devolverError(auth.registrar, { code: "user_already_exists" });
    montarYEnviar();

    const alerta = await esperarAlerta("Ya existe una cuenta con ese correo.");
    expect(screen.getByLabelText("Correo")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Correo")).toHaveAttribute("aria-describedby", alerta.id);
    expect(screen.getByLabelText("Nombre completo")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Contraseña")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Nombre completo")).not.toHaveAttribute("aria-describedby");
    // La contraseña siempre describe su ayuda ("Al menos 8 caracteres."); lo
    // que no debe hacer es describir el error de otro campo.
    expect(
      screen.getByLabelText("Contraseña").getAttribute("aria-describedby")
    ).not.toContain(alerta.id);
  });

  it("contraseña débil marca solo la contraseña", async () => {
    devolverError(auth.registrar, { code: "weak_password" });
    montarYEnviar();

    const alerta = await esperarAlerta("Esa contraseña no sirve: prueba con un largo distinto.");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByLabelText("Contraseña").getAttribute("aria-describedby")
    ).toContain(alerta.id);
    expect(screen.getByLabelText("Correo")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Nombre completo")).not.toHaveAttribute("aria-invalid");
  });

  it("error general: ningún campo inválido y los tres descritos", async () => {
    devolverError(auth.registrar, { code: "over_request_rate_limit" });
    montarYEnviar();

    const alerta = await esperarAlerta("Demasiadas peticiones. Espera un momento.");
    for (const nombre of ["Nombre completo", "Correo", "Contraseña"]) {
      const campo = screen.getByLabelText(nombre);
      expect(campo).not.toHaveAttribute("aria-invalid");
      expect(campo.getAttribute("aria-describedby")).toContain(alerta.id);
    }
  });
});

describe("FormularioRecuperar", () => {
  function montarYEnviar() {
    render(<FormularioRecuperar />);
    // Un correo con forma válida: así el submit llega al servidor y el error
    // que se prueba es el que devuelve auth, no la validación del navegador.
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "a@b.co" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));
  }

  it("un correo inválido marca el correo", async () => {
    devolverError(auth.recuperar, { code: "email_address_invalid" });
    montarYEnviar();

    const alerta = await esperarAlerta("Ese correo no es válido.");
    expect(screen.getByLabelText("Correo")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Correo")).toHaveAttribute("aria-describedby", alerta.id);
  });

  it("un error general describe el correo sin marcarlo inválido", async () => {
    devolverError(auth.recuperar, { code: "over_request_rate_limit" });
    montarYEnviar();

    const alerta = await esperarAlerta("Demasiadas peticiones. Espera un momento.");
    const correo = screen.getByLabelText("Correo");
    expect(correo).not.toHaveAttribute("aria-invalid");
    expect(correo).toHaveAttribute("aria-describedby", alerta.id);
  });
});

describe("FormularioRestablecer", () => {
  function montarYEnviar() {
    render(<FormularioRestablecer token="un-token" enlaceVencido={false} />);
    fireEvent.change(screen.getByLabelText("Contraseña nueva"), {
      target: { value: "secreta123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
  }

  it("una contraseña débil marca la contraseña", async () => {
    devolverError(auth.restablecer, { code: "weak_password" });
    montarYEnviar();

    const alerta = await esperarAlerta("Esa contraseña no sirve: prueba con un largo distinto.");
    const campo = screen.getByLabelText("Contraseña nueva");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo.getAttribute("aria-describedby")).toContain(alerta.id);
  });

  it("un enlace vencido es general: sin campo inválido y con la contraseña descrita", async () => {
    lanzarError(auth.restablecer, { code: "bad_jwt" });
    montarYEnviar();

    const alerta = await esperarAlerta("Ese enlace ya no sirve. Puede que haya vencido o que ya lo hayas usado.");
    const campo = screen.getByLabelText("Contraseña nueva");
    expect(campo).not.toHaveAttribute("aria-invalid");
    expect(campo.getAttribute("aria-describedby")).toContain(alerta.id);
  });

  it("un token inválido devuelto por el servidor también es general", async () => {
    devolverError(auth.restablecer, { code: "INVALID_TOKEN" });
    montarYEnviar();

    const alerta = await esperarAlerta(
      "Ese enlace ya no sirve. Puede que haya vencido o que ya lo hayas usado."
    );
    const campo = screen.getByLabelText("Contraseña nueva");
    expect(campo).not.toHaveAttribute("aria-invalid");
    expect(campo.getAttribute("aria-describedby")).toContain(alerta.id);
  });
});

describe("La ayuda de la contraseña pertenece a su campo", () => {
  it("en registro, sin error el campo describe la ayuda", () => {
    render(<FormularioRegistro />);

    const campo = screen.getByLabelText("Contraseña");
    const ayuda = screen.getByText("Al menos 8 caracteres.");
    expect(ayuda).toHaveAttribute("id");
    expect(campo.getAttribute("aria-describedby")).toBe(ayuda.id);
  });

  it("en registro, con error el campo describe la ayuda y el error a la vez", async () => {
    devolverError(auth.registrar, { code: "weak_password" });
    render(<FormularioRegistro />);
    fireEvent.change(screen.getByLabelText("Nombre completo"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secreta123" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    const alerta = await esperarAlerta("Esa contraseña no sirve: prueba con un largo distinto.");
    const campo = screen.getByLabelText("Contraseña");
    const ayuda = screen.getByText("Al menos 8 caracteres.");
    const descrito = (campo.getAttribute("aria-describedby") ?? "").split(" ");
    expect(descrito).toContain(ayuda.id);
    expect(descrito).toContain(alerta.id);
  });

  it("en restablecer, sin error el campo describe la ayuda", () => {
    render(<FormularioRestablecer token="un-token" enlaceVencido={false} />);

    const campo = screen.getByLabelText("Contraseña nueva");
    const ayuda = screen.getByText("Al menos 8 caracteres.");
    expect(ayuda).toHaveAttribute("id");
    expect(campo.getAttribute("aria-describedby")).toBe(ayuda.id);
  });
});
