import { FormularioRecuperar } from "@/components/auth/formulario-recuperar";

export default function PaginaRecuperarContrasena() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
      <p className="text-sm text-muted-foreground">Que las cuentas cuadren.</p>
      <FormularioRecuperar />
    </div>
  );
}
