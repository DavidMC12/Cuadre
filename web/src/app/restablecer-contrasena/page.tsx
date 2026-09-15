import { FormularioRestablecer } from "@/components/auth/formulario-restablecer";

/**
 * El enlace del correo trae `?token=...`, o `?error=INVALID_TOKEN` si Neon
 * Auth ya detectó que venció o que ya se usó. Ese detalle llega por la URL
 * porque quien lo recibe todavía no tiene sesión: no hay nada más de dónde
 * sacarlo.
 */
export default async function PaginaRestablecerContrasena({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const parametros = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
      <p className="text-sm text-muted-foreground">Que las cuentas cuadren.</p>
      <FormularioRestablecer
        token={parametros.token ?? null}
        enlaceVencido={parametros.error === "INVALID_TOKEN"}
      />
    </div>
  );
}
