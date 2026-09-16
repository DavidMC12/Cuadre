"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { clasificarEdicionDeMonto } from "@/lib/clasificar-edicion-de-monto";
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
 * Toda la decisión de fondo (tecleo seguro vs. texto ajeno que no se puede
 * adivinar) vive en `clasificarEdicionDeMonto`, una función pura y probada
 * aparte. Este componente solo la conecta al DOM, y a propósito NO guarda
 * nada en un `ref` entre cambios: si "confiable" viviera en un `ref`,
 * desmontar y volver a montar el campo (por ejemplo, el formulario que pasa
 * de `Drawer` a `Dialog` al cruzar cierto ancho de pantalla) lo reiniciaría
 * a ciegas mientras el texto ambiguo de un pegado sigue en pantalla. Por eso
 * se recalcula fresco a partir del propio `value` en cada render: no hay
 * nada que se pueda desincronizar.
 *
 * El cursor siempre queda al final después de cualquier cambio — nunca se
 * intenta recolocarlo en medio del texto. Contar dígitos para ubicarlo ahí
 * fue la causa de un error de dinero real (ver el comentario en
 * `clasificar-edicion-de-monto.ts`).
 */
export function CampoMonto({ moneda, value, onChange, permiteSigno, ...resto }: CampoMontoProps) {
  const referencia = useRef<HTMLInputElement>(null);
  const confiable = formatearMientrasEscribe(value, moneda, { permiteSigno }) === value;

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
        const resultado = clasificarEdicionDeMonto(value, evento.target.value, moneda, {
          permiteSigno,
          confiablePrevio: confiable,
        });
        onChange(resultado.texto);
      }}
    />
  );
}
