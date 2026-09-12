/**
 * La zona con la que se decide a qué día y a qué mes pertenece un movimiento.
 *
 * Un gasto del 30 de septiembre a las 11 de la noche en Bogotá es el 1 de
 * octubre en UTC. Agrupar en UTC lo mandaría al mes que no es, y el reporte de
 * septiembre le quedaría corto a quien lo hizo.
 *
 * Vive aquí y no dentro de un módulo porque el mes que ve la persona en el
 * tablero y el día que lee en su archivo exportado tienen que ser el mismo. Si
 * cada módulo escribiera su propia zona, tarde o temprano una se quedaría atrás
 * y los dos números dejarían de cuadrar.
 *
 * Hoy es una constante porque hoy la app tiene un solo dueño. En la Fase 5, con
 * usuarios reales, sale de su perfil.
 */
export const ZONA_HORARIA = 'America/Bogota';
