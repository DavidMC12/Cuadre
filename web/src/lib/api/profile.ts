import { pedir } from "./client";
import type { CambiosDePerfil, Perfil } from "./types";

export function fetchProfile(): Promise<{ data: Perfil }> {
  return pedir("/profile");
}

export function updateProfile(cambios: CambiosDePerfil): Promise<{ data: Perfil }> {
  return pedir("/profile", { metodo: "PATCH", cuerpo: cambios });
}
