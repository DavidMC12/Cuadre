"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
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

/** Cuántos caracteres "significativos" (dígitos y coma decimal) hay antes de una posición. */
function contarSignificativos(texto: string, hasta: number): number {
  let cuenta = 0;
  for (let i = 0; i < hasta && i < texto.length; i += 1) {
    if (/[\d,]/.test(texto[i]!)) cuenta += 1;
  }
  return cuenta;
}

/** La posición, en un texto ya formateado, justo después del n-ésimo carácter significativo. */
function posicionParaSignificativos(texto: string, n: number): number {
  if (n <= 0) return 0;
  let cuenta = 0;
  for (let i = 0; i < texto.length; i += 1) {
    if (/[\d,]/.test(texto[i]!)) {
      cuenta += 1;
      if (cuenta === n) return i + 1;
    }
  }
  return texto.length;
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
 * El cursor se recoloca contando cuántos dígitos (y la coma, si la hay)
 * quedaban a su izquierda antes de la tecla, y ubicándolo después de esos
 * mismos dígitos en el texto ya reformateado — así escribir o borrar en
 * medio de un monto no desordena los dígitos que ya estaban.
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
        // era decimal o de miles: nunca aparece un punto suelto en lo que
        // se escribe a mano, solo en lo que se pega.
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
        const cursor = evento.target.selectionStart ?? crudo.length;
        significativosDeseados.current = contarSignificativos(crudo, cursor);
        onChange(formatearMientrasEscribe(crudo, moneda, { permiteSigno }));
      }}
    />
  );
}
