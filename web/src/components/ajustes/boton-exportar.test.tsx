// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api/client";
import { BotonExportar } from "./boton-exportar";

let soloMirar = false;

vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => soloMirar }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

beforeEach(() => {
  soloMirar = false;
  URL.createObjectURL = vi.fn(() => "blob:archivo");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function montar(descargar = vi.fn()) {
  render(
    <BotonExportar
      descargar={descargar}
      etiqueta="Descargar mis ahorros"
      etiquetaAjena="Descargar sus ahorros"
    />
  );
  return descargar;
}

describe("BotonExportar", () => {
  it("baja el archivo que le pasaron, con el nombre que mandó el servidor", async () => {
    const descargar = vi.fn().mockResolvedValue({
      contenido: new Blob(["a"]),
      nombre: "cuadre-ahorros-2026-10-09.csv",
    });
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    montar(descargar);

    fireEvent.click(screen.getByRole("button", { name: "Descargar mis ahorros" }));

    await waitFor(() => expect(descargar).toHaveBeenCalledTimes(1));
    expect(clic).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    clic.mockRestore();
  });

  it("sobre la cuenta de otra persona dice 'sus', no 'mis'", () => {
    soloMirar = true;
    montar();

    expect(screen.getByRole("button", { name: "Descargar sus ahorros" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Descargar mis ahorros" })).toBeNull();
  });

  it("si falla, avisa con el mensaje del servidor y no deja el botón pegado", async () => {
    const descargar = vi.fn().mockRejectedValue(new ApiError({ code: "INTERNAL", message: "Se cayó" }));
    montar(descargar);

    fireEvent.click(screen.getByRole("button", { name: "Descargar mis ahorros" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Se cayó"));
    expect(
      (screen.getByRole("button", { name: "Descargar mis ahorros" }) as HTMLButtonElement).disabled
    ).toBe(false);
  });
});
