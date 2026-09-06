function esMismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "Hoy", "Ayer", o una fecha larga en español. Para agrupar movimientos. */
export function etiquetaFecha(iso: string): string {
  const fecha = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);

  if (esMismoDia(fecha, hoy)) return "Hoy";
  if (esMismoDia(fecha, ayer)) return "Ayer";

  const mismoAnio = fecha.getFullYear() === hoy.getFullYear();
  const formato = new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: mismoAnio ? undefined : "numeric",
  });
  const texto = formato.format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "2:30 p. m." — la hora corta de un movimiento. */
export function horaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" }).format(
    new Date(iso)
  );
}

/** YYYY-MM-DD para prellenar un <input type="date">. */
export function fechaParaInput(iso: string): string {
  const fecha = new Date(iso);
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/** Convierte YYYY-MM-DD (de un <input type="date">) a un ISO 8601 completo. */
export function inputAIso(fechaInput: string): string {
  // Mediodía local: evita que, al pasar a UTC, la fecha "se corra" un día.
  return new Date(`${fechaInput}T12:00:00`).toISOString();
}
