/**
 * Hook de resolución para los scripts de medición, que corren en node ESM
 * directo (sin webpack ni el tsconfig de la app): los módulos compartidos de
 * `src/lib/` se importan entre sí con el alias `@/...` que este hook traduce
 * a archivos reales de `src/`.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

export function resolve(especificador, contexto, siguiente) {
  if (!especificador.startsWith("@/")) return siguiente(especificador, contexto);
  const base = SRC + especificador.slice(2);
  for (const final of [".ts", ".tsx", "/index.ts"]) {
    const candidata = base + final;
    if (existsSync(candidata)) {
      // Sin `format`: node detecta "module-typescript" por la extensión .ts.
      return { url: `file://${candidata}`, shortCircuit: true };
    }
  }
  return siguiente(especificador, contexto);
}
