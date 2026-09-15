/**
 * El título visible de una tarjeta de auth, como `<h1>` real: antes salía de
 * `CardTitle`, que renderiza un `<div>` sin ningún significado semántico.
 *
 * No se cambió `CardTitle` en sí (lo usa también el dashboard para títulos
 * de tarjeta que no deben ser `<h1>`); esto solo copia sus mismas clases.
 */
export function TituloAuth({ children }: { children: React.ReactNode }) {
  return <h1 className="font-heading text-base leading-snug font-medium">{children}</h1>;
}
