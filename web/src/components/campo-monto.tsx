"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { clasificarEdicionDeMonto } from "@/lib/clasificar-edicion-de-monto";
import { posicionParaSignificativos } from "@/lib/cursor-de-monto";

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
 * Toda la decisión de fondo (tecleo seguro vs. texto ajeno que no se puede
 * adivinar) vive en `clasificarEdicionDeMonto`, una función pura y probada
 * aparte — este componente solo la conecta al DOM: le pasa el texto y el
 * cursor de cada cambio, recuerda si lo que hay en pantalla sigue siendo
 * confiable, y recoloca el cursor cuando la función dice dónde.
 */
export function CampoMonto({ moneda, value, onChange, permiteSigno, ...resto }: CampoMontoProps) {
  const referencia = useRef<HTMLInputElement>(null);
  const significativosDeseados = useRef<number | null>(null);
  const confiable = useRef(true);

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
      onChange={(evento) => {
        const crudo = evento.target.value;
        const cursor = evento.target.selectionStart ?? crudo.length;

        const resultado = clasificarEdicionDeMonto(value, crudo, cursor, moneda, {
          permiteSigno,
          confiablePrevio: confiable.current,
        });

        confiable.current = resultado.confiable;
        significativosDeseados.current = resultado.cursorSignificativos;
        onChange(resultado.texto);
      }}
    />
  );
}
