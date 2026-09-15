"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { CampoContrasena } from "@/components/auth/campo-contrasena";
import { authClient } from "@/lib/auth/client";
import { mensajeErrorAuth, mensajeErrorAuthLanzado } from "@/lib/auth/errors";
import { cn } from "@/lib/utils";

/**
 * Pone una contraseña nueva a partir del enlace que llegó por correo.
 *
 * El enlace trae un token en la URL (`?token=...`) o, si ya venció o ya se
 * usó, un `?error=INVALID_TOKEN` que pone Neon Auth mismo al redirigir aquí
 * —eso se revisa antes de mostrar el formulario, no después de enviarlo.
 */
export function FormularioRestablecer({
  token,
  enlaceVencido,
}: {
  token: string | null;
  enlaceVencido: boolean;
}) {
  const [contrasena, setContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!token) return;

    setError(null);
    setEnviando(true);

    try {
      const { error: errorAuth } = await authClient.resetPassword({
        newPassword: contrasena,
        token,
      });

      if (errorAuth) {
        setError(mensajeErrorAuth(errorAuth));
        return;
      }

      setListo(true);
    } catch (excepcion) {
      // Un enlace vencido o ya usado llega hasta acá lanzado, no como
      // `{ error }`: ver el comentario de `bad_jwt` en auth/errors.ts.
      setError(mensajeErrorAuthLanzado(excepcion));
    } finally {
      setEnviando(false);
    }
  }

  if (enlaceVencido || !token) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="font-heading text-base leading-snug font-medium">
            Ese enlace ya no sirve
          </h1>
          <CardDescription>
            Puede que haya vencido o que ya lo hayas usado. Pide uno nuevo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/recuperar-contrasena" className={cn(buttonVariants(), "h-10 w-full")}>
            Pedir un enlace nuevo
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (listo) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="font-heading text-base leading-snug font-medium">
            Contraseña actualizada
          </h1>
          <CardDescription>Ya puedes entrar con tu contraseña nueva.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/entrar" className={cn(buttonVariants(), "h-10 w-full")}>
            Entrar
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <h1 className="font-heading text-base leading-snug font-medium">
          Pon una contraseña nueva
        </h1>
        <CardDescription>Elige una contraseña que no hayas usado antes.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={manejarEnvio} className="flex flex-col gap-4">
          <CampoContrasena
            id="contrasena-nueva"
            label="Contraseña nueva"
            value={contrasena}
            onChange={setContrasena}
            autoComplete="new-password"
            minLength={8}
            invalido={Boolean(error)}
            ayuda="Al menos 8 caracteres."
            autoFocus
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={enviando} className="h-10 w-full">
            {enviando ? "Guardando…" : "Guardar contraseña"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
