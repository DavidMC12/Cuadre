"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { formatearMientrasEscribe } from "@/lib/formatear-mientras-escribe";

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
 * El cursor se manda siempre al final después de cada tecla: reformatear en
 * medio del texto movería los separadores de forma impredecible, y un monto
 * casi siempre se escribe (o se corrige) de atrás para adelante.
 */
export function CampoMonto({ moneda, value, onChange, permiteSigno, ...resto }: CampoMontoProps) {
  const referencia = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const elemento = referencia.current;
    if (elemento && document.activeElement === elemento) {
      elemento.setSelectionRange(elemento.value.length, elemento.value.length);
    }
  }, [value]);

  return (
    <Input
      {...resto}
      ref={referencia}
      inputMode="decimal"
      value={value}
      onChange={(evento) => {
        onChange(formatearMientrasEscribe(evento.target.value, moneda, { permiteSigno }));
      }}
    />
  );
}
