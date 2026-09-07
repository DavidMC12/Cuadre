/**
 * Marca visual compartida por todos los iconos de la PWA (favicon, apple
 * touch icon, iconos del manifest): un cuadrado simple, sin nada elaborado.
 */
export function marcaIcono(tamano: number) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#18181b",
        color: "#fafafa",
        fontFamily: "sans-serif",
        fontWeight: 700,
        fontSize: Math.round(tamano * 0.58),
      }}
    >
      C
    </div>
  );
}
