"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { mensajeErrorAuth } from "@/lib/auth/errors";

export function FormularioRegistro() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      const { error: errorAuth } = await authClient.signUp.email({
        name: nombre.trim(),
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
      // interpretar). No debe quedar la pantalla congelada en "Creando…".
      setError(mensajeErrorAuth(null));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>Un correo, una contraseña y listo.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={manejarEnvio} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              type="text"
              autoComplete="name"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              aria-invalid={Boolean(error)}
              required
              autoFocus
            />
          </div>

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
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contrasena">Contraseña</Label>
            <Input
              id="contrasena"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={contrasena}
              onChange={(evento) => setContrasena(evento.target.value)}
              aria-invalid={Boolean(error)}
              required
            />
            <p className="text-xs text-muted-foreground">Al menos 8 caracteres.</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? "Creando cuenta…" : "Crear cuenta"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href="/entrar" className="text-foreground underline underline-offset-4">
            Entra
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
