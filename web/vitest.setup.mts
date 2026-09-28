import "@testing-library/jest-dom/vitest";

// jsdom no implementa matchMedia; lo mínimo que los hooks de la app
// necesitan para poder correr en pruebas de componente.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (consulta: string) =>
    ({
      matches: false,
      media: consulta,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
