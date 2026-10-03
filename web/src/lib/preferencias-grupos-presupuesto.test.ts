import { describe, expect, it } from "vitest";

import {
  CLAVE_ALMACEN_GRUPOS_CERRADOS,
  guardarGruposCerrados,
  leerGruposCerrados,
  podarGruposCerrados,
  type AlmacenDeGrupos,
} from "./preferencias-grupos-presupuesto";

function almacenFalso(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => {
      datos.set(clave, valor);
    },
  } satisfies AlmacenDeGrupos & { datos: Map<string, string> };
}

describe("preferencias de grupos: leer y guardar", () => {
  it("la clave lleva prefijo y versión del proyecto", () => {
    expect(CLAVE_ALMACEN_GRUPOS_CERRADOS).toBe("cuadre:presupuesto:grupos-cerrados:v1");
  });

  it("guarda y vuelve a leer el conjunto", () => {
    const almacen = almacenFalso();
    guardarGruposCerrados(["cat-comida", "cat-transporte"], almacen);

    expect(leerGruposCerrados(almacen)).toEqual(new Set(["cat-comida", "cat-transporte"]));
  });

  it("guarda un JSON de lista ordenado", () => {
    const almacen = almacenFalso();
    guardarGruposCerrados(["cat-transporte", "cat-comida", "ahorro"], almacen);

    expect(almacen.getItem(CLAVE_ALMACEN_GRUPOS_CERRADOS)).toBe(
      JSON.stringify(["ahorro", "cat-comida", "cat-transporte"])
    );
  });

  it("sin nada guardado devuelve vacío (todo abierto)", () => {
    expect(leerGruposCerrados(almacenFalso())).toEqual(new Set());
  });

  it("con JSON corrupto se comporta como todo abierto", () => {
    const almacen = almacenFalso({ [CLAVE_ALMACEN_GRUPOS_CERRADOS]: "{no es json" });
    expect(leerGruposCerrados(almacen)).toEqual(new Set());
  });

  it("con un valor que no es lista se comporta como todo abierto", () => {
    const almacen = almacenFalso({ [CLAVE_ALMACEN_GRUPOS_CERRADOS]: '{"a":1}' });
    expect(leerGruposCerrados(almacen)).toEqual(new Set());
  });

  it("ignora los elementos que no son texto", () => {
    const almacen = almacenFalso({
      [CLAVE_ALMACEN_GRUPOS_CERRADOS]: JSON.stringify(["cat-comida", 7, null, "ahorro"]),
    });
    expect(leerGruposCerrados(almacen)).toEqual(new Set(["cat-comida", "ahorro"]));
  });

  it("si el almacén lanza al leer, no rompe: todo abierto", () => {
    const queLanza: AlmacenDeGrupos = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {},
    };
    expect(leerGruposCerrados(queLanza)).toEqual(new Set());
  });

  it("si el almacén lanza al guardar, devuelve false y no propaga el error", () => {
    const queLanza: AlmacenDeGrupos = {
      getItem: () => null,
      setItem: () => {
        throw new Error("modo privado");
      },
    };
    expect(guardarGruposCerrados(["cat-comida"], queLanza)).toBe(false);
  });

  it("sin almacén (SSR) leer da vacío y guardar devuelve false", () => {
    expect(leerGruposCerrados(null)).toEqual(new Set());
    expect(guardarGruposCerrados(["cat-comida"], null)).toBe(false);
  });

  it("guarda true cuando el almacén acepta", () => {
    expect(guardarGruposCerrados(["cat-comida"], almacenFalso())).toBe(true);
  });

  it("un valor enorme se recorta al tope defensivo", () => {
    const almacen = almacenFalso({
      [CLAVE_ALMACEN_GRUPOS_CERRADOS]: JSON.stringify(
        Array.from({ length: 1000 }, (_, i) => `cat-${i}`)
      ),
    });
    expect(leerGruposCerrados(almacen).size).toBe(200);
  });
});

describe("preferencias de grupos: poda de claves que ya no existen", () => {
  it("conserva las claves válidas (categorías y claves propias) y descarta el resto", () => {
    const validas = new Set(["cat-comida", "cat-transporte", "ahorro", "sin-categoria"]);

    expect(podarGruposCerrados(new Set(["cat-comida", "cat-borrada", "ahorro"]), validas)).toEqual(
      new Set(["cat-comida", "ahorro"])
    );
  });

  it("una categoría sin ítems este mes no se poda si sigue en el catálogo", () => {
    const validas = new Set(["cat-comida", "cat-viajes", "ahorro", "sin-categoria"]);
    // "cat-viajes" no aparece en los grupos del mes pero sí en el catálogo.
    expect(podarGruposCerrados(new Set(["cat-viajes"]), validas)).toEqual(new Set(["cat-viajes"]));
  });
});
