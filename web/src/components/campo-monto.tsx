"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { contarSignificativos, posicionParaSignificativos } from "@/lib/cursor-de-monto";
import { formatearMientrasEscribe } from "@/lib/formatear-mientras-escribe";
import { decimalesDe } from "@/lib/money";

type PropsDeInput = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "inputMode"
>;

interface CampoMontoProps extends PropsDeInput {
  moneda: string;
  value: string;
  onChange: (valor: string) => void;
  /** Para el saldo inicial de una cuenta, que sí puede empezar en negativo. */
  permiteSigno?: boolean;
}

/** Pegar o soltar trae texto de afuera; cualquier otro tipo es tecla por tecla. */
function esTextoPegado(evento: React.ChangeEvent<HTMLInputElement>): boolean {
  const tipo = (evento.nativeEvent as InputEvent | undefined)?.inputType;
  return tipo === "insertFromPaste" || tipo === "insertFromDrop";
}

/**
 * Un campo de texto para escribir un monto, que va agrupando los miles (y
 * separando los decimales, si la moneda usa) a medida que la persona
 * escribe, en vez de mostrar una fila de dígitos sin puntuar donde un cero de
 * más pasa fácil desapercibido.
 *
 * `value`/`onChange` siguen siendo el mismo texto de siempre — lo que ya
 * entienden `normalizarMontoIngresado`/`normalizarMontoConSigno` — así que
 * reemplazar un `<Input>` por este componente no cambia nada más en el
 * formulario que lo usa.
 *
 * Tecleo y pegado se tratan distinto (ver `formatear-mientras-escribe.ts`):
 * tecleando siempre es seguro reagrupar todo desde cero, porque el texto de
 * entrada es siempre lo que este mismo campo ya había formateado más una
 * tecla; pegando el texto viene de afuera y puede traer una convención de
 * separadores distinta, así que ahí se es estricto en vez de adivinar.
 *
 * El cursor solo se recoloca en el camino de tecleo, contando cuántos
 * dígitos (y la coma, si la hay) quedaban a su izquierda antes de la tecla —
 * al pegar, el navegador ya deja el cursor donde corresponde.
 */
export function CampoMonto({ moneda, value, onChange, permiteSigno, ...resto }: CampoMontoProps) {
  const referencia = useRef<HTMLInputElement>(null);
  const significativosDeseados = useRef<number | null>(null);

  useEffect(() => {
    const elemento = referencia.current;
    const posicion = significativosDeseados.current;
    if (elemento && document.activeElement === elemento && posicion !== null) {
      const nueva = posicionParaSignificativos(elemento.value, posicion);
      elemento.setSelectionRange(nueva, nueva);
    }
  }, [value]);

  return (
    <Input
      {...resto}
      ref={referencia}
      inputMode="decimal"
      value={value}
      onKeyDown={(evento) => {
        // Sin coma en el teclado, un numérico de celular solo tiene punto.
        // Convertirlo en coma AQUÍ (antes de que llegue a onChange) evita
        // por completo la ambigüedad de adivinar, más tarde, si un punto
        // era decimal o de miles: al escribir, nunca aparece un punto suelto
        // en lo que llega a formatearMientrasEscribe.
        if (evento.key === "." && decimalesDe(moneda) > 0) {
          evento.preventDefault();
          const elemento = evento.currentTarget;
          const inicio = elemento.selectionStart ?? elemento.value.length;
          const fin = elemento.selectionEnd ?? elemento.value.length;
          const crudo = `${elemento.value.slice(0, inicio)},${elemento.value.slice(fin)}`;
          significativosDeseados.current = contarSignificativos(crudo, inicio + 1);
          onChange(formatearMientrasEscribe(crudo, moneda, { permiteSigno }));
        }
        resto.onKeyDown?.(evento);
      }}
      onChange={(evento) => {
        const crudo = evento.target.value;
        const pegado = esTextoPegado(evento);

        significativosDeseados.current = pegado
          ? null
          : contarSignificativos(crudo, evento.target.selectionStart ?? crudo.length);

        onChange(formatearMientrasEscribe(crudo, moneda, { permiteSigno, pegado }));
      }}
    />
  );
}
