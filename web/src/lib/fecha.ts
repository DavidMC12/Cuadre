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

/** "YYYY-MM" del mes en curso, para prellenar el dashboard. */
export function mesActual(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
}

/** Suma (o resta) meses a un "YYYY-MM" y devuelve otro "YYYY-MM". */
export function sumarMeses(mes: string, delta: number): string {
  const [anio, mesNumero] = mes.split("-").map(Number);
  const fecha = new Date(anio, mesNumero - 1 + delta, 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" -> "Septiembre 2026". */
export function etiquetaMes(mes: string): string {
  const [anio, mesNumero] = mes.split("-").map(Number);
  const texto = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(
    new Date(anio, mesNumero - 1, 1)
  );
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Un instante completo -> "Septiembre de 2026".
 *
 * Usa la zona de este aparato, no UTC: quien se registró un 31 de agosto a las
 * 8 de la noche en Bogotá se registró en agosto, aunque en UTC ya fuera
 * septiembre.
 */
export function etiquetaMesDeFecha(iso: string): string {
  const texto = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(
    new Date(iso)
  );
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "YYYY-MM" -> "Sep" (para los ejes de la gráfica de tendencia). */
export function etiquetaMesCorta(mes: string): string {
  const [anio, mesNumero] = mes.split("-").map(Number);
  const texto = new Intl.DateTimeFormat("es-CO", { month: "short" }).format(
    new Date(anio, mesNumero - 1, 1)
  );
  return texto.replace(".", "").charAt(0).toUpperCase() + texto.replace(".", "").slice(1);
}
