"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TituloAuth } from "@/components/auth/titulo-auth";
import { authClient } from "@/lib/auth/client";
import {
  interpretarErrorAuth,
  interpretarErrorAuthLanzado,
  type CampoDeAuth,
  type ErrorAuthInterpretado,
} from "@/lib/auth/errors";
import { cn } from "@/lib/utils";

/**
 * Pide el correo y manda el enlace para poner una contraseña nueva.
 *
 * El mensaje de "listo" es SIEMPRE el mismo, exista o no una cuenta con ese
 * correo: el servidor de Neon Auth ya responde así a propósito (no revela si
 * el correo existe), y esta pantalla no puede decir algo distinto sin
 * deshacer esa protección. Confirmar o negar dejaría adivinar quién usa la
 * app solo con probar correos.
 */
export function FormularioRecuperar() {
  const [correo, setCorreo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<ErrorAuthInterpretado | null>(null);
  const idError = useId();

  // El error general describe al correo (el único campo); el específico,
  // también. Aquí nunca hay error de contraseña.
  const descritoPor = (campo: CampoDeAuth) =>
    error && (error.campo === null || error.campo === campo) ? idError : undefined;

  async function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      const correoLimpio = correo.trim();
      const { error: errorAuth } = await authClient.requestPasswordReset({
        email: correoLimpio,
        redirectTo: `${window.location.origin}/restablecer-contrasena`,
      });

      if (errorAuth) {
        setError(interpretarErrorAuth(errorAuth));
        return;
      }

      setEnviado(true);
    } catch (excepcion) {
      setError(interpretarErrorAuthLanzado(excepcion));
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <TituloAuth>Revisa tu correo</TituloAuth>
          <CardDescription>
            Si {correo.trim()} tiene una cuenta en Cuadre, te mandamos un enlace para poner una
            contraseña nueva. Puede tardar unos minutos en llegar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/entrar" className={cn(buttonVariants(), "h-11 w-full")}>
            Volver a entrar
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <TituloAuth>¿Olvidaste tu contraseña?</TituloAuth>
        <CardDescription>
          Escribe tu correo y te mandamos un enlace para poner una nueva.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={manejarEnvio} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="correo">Correo</Label>
            <Input
              id="correo"
              type="email"
              autoComplete="email"
              value={correo}
              onChange={(evento) => setCorreo(evento.target.value)}
              aria-invalid={error?.campo === "correo"}
              aria-describedby={descritoPor("correo")}
              required
              autoFocus
              className="h-11"
            />
          </div>

          {error && (
            <p id={idError} role="alert" className="text-sm text-destructive">
              {error.mensaje}
            </p>
          )}

          <Button type="submit" disabled={enviando} className="h-11 w-full">
            {enviando ? "Enviando…" : "Enviar enlace"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link
            href="/entrar"
            className="inline-block -my-2 px-1 py-2 text-foreground underline underline-offset-4"
          >
            Volver a entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
