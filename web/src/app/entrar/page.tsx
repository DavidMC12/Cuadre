import { redirect } from "next/navigation";

import { FormularioEntrar } from "@/components/auth/formulario-entrar";
import { auth } from "@/lib/auth/server";

// Usa `getSession`, asi que esta pantalla se renderiza en cada peticion.
export const dynamic = "force-dynamic";

export default async function PaginaEntrar() {
  const { data: session } = await auth.getSession();
  if (session?.user) redirect("/");

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-8">
      <FormularioEntrar />
    </div>
  );
}
