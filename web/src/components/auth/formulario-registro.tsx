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
import { mensajeErrorAuth, mensajeErrorAuthLanzado } from "@/lib/auth/errors";

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
    } catch (excepcion) {
      // La llamada puede lanzar en vez de devolver `error` (p. ej. si el
      // servicio de autenticación responde con un error que no sabe
      // interpretar). No debe quedar la pantalla congelada en "Creando…".
      setError(mensajeErrorAuthLanzado(excepcion));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <h1 className="font-heading text-base leading-snug font-medium">Crear cuenta</h1>
        <CardDescription>Un correo, una contraseña y listo.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={manejarEnvio} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nombre">Nombre completo</Label>
            <Input
              id="nombre"
              type="text"
              autoComplete="name"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              aria-invalid={Boolean(error)}
              required
              // `required` por sí solo acepta una cadena de solo espacios (no
              // está vacía). El patrón exige al menos un carácter que no sea
              // espacio en blanco, en cualquier posición.
              pattern=".*\S.*"
              autoFocus
              className="h-10"
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
              className="h-10"
            />
          </div>

          <CampoContrasena
            id="contrasena"
            label="Contraseña"
            value={contrasena}
            onChange={setContrasena}
            autoComplete="new-password"
            minLength={8}
            invalido={Boolean(error)}
            ayuda="Al menos 8 caracteres."
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={enviando} className="h-10 w-full">
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
