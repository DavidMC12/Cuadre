"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { exportTransactions } from "@/lib/api/transactions";

export function BotonExportar() {
  const [descargando, setDescargando] = useState(false);

  async function manejarClic() {
    setDescargando(true);

    try {
      const { contenido, nombre } = await exportTransactions();

      // El archivo ya está en memoria: se le arma un enlace invisible y se le
      // hace clic, que es la única forma de que el navegador lo guarde con el
      // nombre que mandó el servidor.
      const direccion = URL.createObjectURL(contenido);
      const enlace = document.createElement("a");
      enlace.href = direccion;
      enlace.download = nombre;
      document.body.append(enlace);
      enlace.click();
      enlace.remove();

      // Se libera en el siguiente ciclo: revocarlo de una puede cortar la
      // descarga antes de que el navegador alcance a empezarla.
      setTimeout(() => URL.revokeObjectURL(direccion), 0);
    } catch (fallo) {
      toast.error(
        fallo instanceof ApiError ? fallo.message : "No se pudo bajar el archivo. Intenta de nuevo."
      );
    } finally {
      setDescargando(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={manejarClic}
      disabled={descargando}
      className="w-full"
    >
      <Download data-icon="inline-start" />
      {descargando ? "Preparando…" : "Descargar mis movimientos"}
    </Button>
  );
}
