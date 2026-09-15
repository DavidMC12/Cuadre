"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoContrasena } from "@/components/auth/campo-contrasena";
import { authClient } from "@/lib/auth/client";
import { mensajeErrorAuth } from "@/lib/auth/errors";

export function FormularioEntrar() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      const { error: errorAuth } = await authClient.signIn.email({
        email: correo.trim(),
        password: contrasena,
      });

      if (errorAuth) {
        setError(mensajeErrorAuth(errorAuth));
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      // La llamada puede lanzar en vez de devolver `error` (p. ej. si el
      // servicio de autenticación responde con un error que no sabe
      // interpretar). No debe quedar la pantalla congelada en "Entrando…".
      setError(mensajeErrorAuth(null));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <h1 className="font-heading text-base leading-snug font-medium">Entrar</h1>
        <CardDescription>Entra con tu correo y tu contraseña.</CardDescription>
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
              aria-invalid={Boolean(error)}
              required
              autoFocus
              className="h-10"
            />
          </div>

          <CampoContrasena
            id="contrasena"
            label="Contraseña"
            value={contrasena}
            onChange={setContrasena}
            autoComplete="current-password"
            invalido={Boolean(error)}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={enviando} className="h-10 w-full">
            {enviando ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?{" "}
          <Link href="/registrarse" className="text-foreground underline underline-offset-4">
            Regístrate
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
