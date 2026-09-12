"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategorias } from "@/hooks/use-categorias";
import type { TipoCategoria } from "@/lib/api/types";

/** El componente Select no acepta un value vacío; este valor marca "ninguna". */
const SIN_CATEGORIA = "__sin_categoria__";

export function SelectorCategoria({
  id,
  kind,
  value,
  onChange,
}: {
  id?: string;
  /** Si se da, solo se ven las categorías de ese tipo (gasto o ingreso). */
  kind?: TipoCategoria;
  value: string | undefined;
  onChange: (categoryId: string | undefined) => void;
}) {
  const { data: categorias } = useCategorias(false);

  const gastos = (categorias ?? []).filter((categoria) => categoria.kind === "expense");
  const ingresos = (categorias ?? []).filter((categoria) => categoria.kind === "income");
  const filtradas = kind === "expense" ? gastos : kind === "income" ? ingresos : null;

  const nombrePorId = new Map(
    (categorias ?? []).map((categoria) => [categoria.id, categoria.name])
  );

  return (
    <Select
      value={value ?? SIN_CATEGORIA}
      onValueChange={(valor) => onChange(valor === SIN_CATEGORIA || !valor ? undefined : valor)}
    >
      <SelectTrigger id={id} className="w-full">
        {/* El popup con las opciones vive en un portal que no está montado
            mientras el selector está cerrado, así que no hay de dónde sacar
            el nombre: hay que resolverlo a mano en vez de confiar en que el
            componente encuentre solo el texto del item elegido. */}
        <SelectValue placeholder="Sin categoría">
          {(valor: string) =>
            valor && valor !== SIN_CATEGORIA ? (nombrePorId.get(valor) ?? valor) : "Sin categoría"
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SIN_CATEGORIA}>Sin categoría</SelectItem>
        {filtradas ? (
          filtradas.map((categoria) => (
            <SelectItem key={categoria.id} value={categoria.id}>
              {categoria.name}
            </SelectItem>
          ))
        ) : (
          <>
            {gastos.length > 0 && (
              <SelectGroup>
                <SelectLabel>Gastos</SelectLabel>
                {gastos.map((categoria) => (
                  <SelectItem key={categoria.id} value={categoria.id}>
                    {categoria.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {ingresos.length > 0 && (
              <SelectGroup>
                <SelectLabel>Ingresos</SelectLabel>
                {ingresos.map((categoria) => (
                  <SelectItem key={categoria.id} value={categoria.id}>
                    {categoria.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </>
        )}
      </SelectContent>
    </Select>
  );
}
