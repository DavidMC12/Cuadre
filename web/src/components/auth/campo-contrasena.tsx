"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Un campo de contraseña con botón para mostrar u ocultar lo escrito.
 *
 * Sin esto, la única forma de revisar una contraseña larga antes de enviarla
 * es borrarla y volver a escribirla con cuidado. El botón mide 40px de alto y
 * de ancho —el mismo tamaño de control que ya usa el resto de la app para
 * algo que se toca con el dedo—, y ocupa toda la altura del campo para que el
 * área de toque no quede angosta.
 */
export function CampoContrasena({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  invalido,
  ayuda,
  autoFocus = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  invalido?: boolean;
  /** Una línea corta debajo del campo. Solo cuando de verdad aclara algo. */
  ayuda?: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          value={value}
          onChange={(evento) => onChange(evento.target.value)}
          aria-invalid={invalido}
          required
          autoFocus={autoFocus}
          className="h-10 pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((valor) => !valor)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/85"
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}
