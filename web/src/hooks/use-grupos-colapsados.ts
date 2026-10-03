"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  CLAVE_ALMACEN_GRUPOS_CERRADOS,
  guardarGruposCerrados,
  leerGruposCerrados,
  podarGruposCerrados,
} from "@/lib/preferencias-grupos-presupuesto";

/**
 * Recuerda qué grupos del panel de presupuesto quedaron cerrados.
 *
 * La preferencia vive en `localStorage` (por persona y navegador) y se comparte
 * entre el Resumen y /presupuesto, entre meses y monedas. Es un almacén externo
 * con suscriptores: `useSyncExternalStore` evita el error de hidratación de
 * Next (el servidor usa un conjunto vacío y el cliente lee `localStorage`), y
 * hace que dos paneles montados a la vez —o dos pestañas— vean lo mismo.
 *
 * El primer render es "todo abierto": leer en un efecto o esperar a un
 * esqueleto haría parpadear la pantalla o esconder el checklist un instante.
 * Como los grupos recién se pintan cuando llegan los datos (consulta
 * asíncrona), lo guardado ya está aplicado para cuando se ven.
 *
 * Un grupo nunca visto aparece abierto. La poda de claves que ya no existen
 * solo corre cuando `clavesValidas` (el catálogo completo + las claves propias)
 * ya se conoce; nunca mientras una consulta está en curso.
 */
type Escucha = () => void;

const VACIO = new Set<string>();
const oyentes = new Set<Escucha>();

// Última cadena leída y su conjunto: `getSnapshot` debe devolver una referencia
// estable mientras el contenido no cambie, o React re-renderiza sin fin.
let ultimoCrudo: string | null | undefined = undefined;
let ultimoConjunto: Set<string> = VACIO;

function crudoDelNavegador(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(CLAVE_ALMACEN_GRUPOS_CERRADOS);
  } catch {
    return null;
  }
}

function instantanea(): Set<string> {
  const crudo = crudoDelNavegador();
  if (crudo === ultimoCrudo) return ultimoConjunto;
  ultimoCrudo = crudo;
  ultimoConjunto = leerGruposCerrados();
  return ultimoConjunto;
}

function instantaneaDelServidor(): Set<string> {
  return VACIO;
}

function avisarATodos() {
  for (const oyente of oyentes) oyente();
}

function alCambiarElAlmacen(evento: StorageEvent) {
  if (evento.key !== null && evento.key !== CLAVE_ALMACEN_GRUPOS_CERRADOS) return;
  avisarATodos();
}

function suscribir(oyente: Escucha): () => void {
  oyentes.add(oyente);
  if (oyentes.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", alCambiarElAlmacen);
  }
  return () => {
    oyentes.delete(oyente);
    if (oyentes.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", alCambiarElAlmacen);
    }
  };
}

function escribir(siguientes: Set<string>) {
  const guardado = guardarGruposCerrados(siguientes);
  if (!guardado) {
    // Sin persistencia (modo privado, almacén bloqueado o lleno) igual hay que
    // reflejar la intención en memoria: si no, el toggle no haría nada porque
    // el snapshot no cambiaría. El conjunto vive en el caché hasta que se
    // pueda volver a escribir.
    ultimoCrudo = crudoDelNavegador();
    ultimoConjunto = siguientes;
  }
  // El siguiente `getSnapshot` ya refleja lo escrito (se relee `localStorage`);
  // si no se pudo guardar, devuelve el conjunto en memoria.
  avisarATodos();
}

/** Solo para pruebas: olvida el estado en memoria del almacén externo. */
export function olvidarGruposColapsadosEnMemoria() {
  ultimoCrudo = undefined;
  ultimoConjunto = VACIO;
}

export function useGruposColapsados(clavesValidas: ReadonlySet<string> | null) {
  const colapsados = useSyncExternalStore(suscribir, instantanea, instantaneaDelServidor);

  // Poda de claves que ya no existen (categorías borradas). Actualiza el
  // almacén externo, no estado de React; se salta si el catálogo aún no llegó:
  // una consulta en curso no debe borrar nada.
  useEffect(() => {
    if (!clavesValidas) return;
    const actuales = instantanea();
    const podadas = podarGruposCerrados(actuales, clavesValidas);
    if (podadas.size !== actuales.size) escribir(podadas);
  }, [clavesValidas]);

  const alternar = useCallback((clave: string) => {
    const siguientes = new Set(instantanea());
    if (siguientes.has(clave)) siguientes.delete(clave);
    else siguientes.add(clave);
    escribir(siguientes);
  }, []);

  const contraerTodo = useCallback((claves: Iterable<string>) => {
    // Se suman a lo ya cerrado: contraer no olvida las categorías de otros
    // meses que hoy no tienen ítems.
    const siguientes = new Set(instantanea());
    for (const clave of claves) siguientes.add(clave);
    escribir(siguientes);
  }, []);

  const expandirTodo = useCallback(() => {
    // Desplegar todo vacía el conjunto: no queda ningún grupo cerrado.
    escribir(new Set());
  }, []);

  return { colapsados, alternar, contraerTodo, expandirTodo };
}
