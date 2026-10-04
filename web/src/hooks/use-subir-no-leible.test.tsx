// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useSubirNoLeible } from "./use-subir-no-leible";

afterEach(() => vi.restoreAllMocks());

describe("useSubirNoLeible: reporta y limpia", () => {
  it("avisa el valor inicial al montar", () => {
    const avisar = vi.fn();
    renderHook(() => useSubirNoLeible(true, avisar));
    expect(avisar).toHaveBeenCalledWith(true);
  });

  it("avisa el cambio cuando la consulta deja de ser ilegible", () => {
    const avisar = vi.fn();
    const { rerender } = renderHook(
      ({ noLeible }: { noLeible: boolean }) => useSubirNoLeible(noLeible, avisar),
      { initialProps: { noLeible: true } }
    );
    expect(avisar).toHaveBeenLastCalledWith(true);

    rerender({ noLeible: false });
    expect(avisar).toHaveBeenLastCalledWith(false);
  });

  it("al desmontar avisa false, aunque la última lectura fuera true", () => {
    const avisar = vi.fn();
    const { unmount } = renderHook(() => useSubirNoLeible(true, avisar));
    avisar.mockClear();

    unmount();
    expect(avisar).toHaveBeenCalledWith(false);
  });

  it("una lambda nueva del padre no dispara el reset (la limpieza es solo al desmontar)", () => {
    const avisar = vi.fn();
    const { rerender } = renderHook(
      ({ noLeible }: { noLeible: boolean }) =>
        // Callback nuevo en cada render, como pasaría con una lambda inline.
        useSubirNoLeible(noLeible, (valor) => avisar(valor)),
      { initialProps: { noLeible: true } }
    );
    avisar.mockClear();

    rerender({ noLeible: true });
    // No debe haber un `false` fantasma por el cambio de identidad.
    expect(avisar).not.toHaveBeenCalledWith(false);
  });
});
