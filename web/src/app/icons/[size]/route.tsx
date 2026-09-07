import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

import { marcaIcono } from "@/lib/icon";

/**
 * Iconos de la PWA en el tamaño que pida `manifest.ts` (192 y 512), todos con
 * la misma marca simple de `lib/icon.tsx`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size: parametroTamano } = await params;
  const tamano = Number(parametroTamano);

  if (!Number.isInteger(tamano) || tamano <= 0 || tamano > 1024) {
    return NextResponse.json({ error: "Tamaño de icono inválido" }, { status: 400 });
  }

  return new ImageResponse(marcaIcono(tamano), { width: tamano, height: tamano });
}
