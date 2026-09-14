# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

PWA responsive: se instala en el celular y se usa como app, pero es la misma web. No hay app nativa.

## Users

Hoy, el dueño del proyecto, que lleva sus propias cuentas; existen además un par de cuentas de gente cercana. La intención es abrirla al público más adelante, así que el diseño tiene que aguantar a personas que no conocen el proyecto por dentro.

Dos situaciones de uso, con el mismo peso:

- **Registrar al gastar:** en el celular, de pie, en segundos, a veces con una mano, justo después de pagar algo.
- **Repasar con calma:** sentado, muchas veces en el computador, para ver cuánto entró y salió en el mes y a dónde se fue la plata.

Hay además un rol de administrador (hoy solo el dueño) que entra a ver la cuenta de otra persona para darle soporte, en modo solo lectura.

## Product Purpose

App de finanzas personales para llevar las propias cuentas: bancos, tarjetas y efectivo, con sus movimientos, categorías y un resumen mensual. El éxito es que la app le sirva a su dueño para saber, sin dudar, cuánta plata tiene y en qué se le va. Lema: *Que las cuentas cuadren.*

## Positioning

Cuadre no confía en que el usuario (ni el código) no se equivoque: la exactitud la garantiza la base de datos. El saldo no se guarda en ninguna parte, se calcula sumando los movimientos, así que es imposible que saldo y detalle se contradigan. Los movimientos no se editan ni se borran: un error se corrige registrando otro que lo anula, y el historial muestra lo que de verdad pasó, errores incluidos. Pasar plata entre cuentas propias no cuenta como gasto ni ingreso.

## Operating Context

- Registro manual de cada movimiento (hoy no hay conexión con bancos).
- Cuentas de tipo banco, tarjeta o efectivo, en COP o USD; nunca se suman montos de monedas distintas.
- Resumen mensual de ingresos, gastos y balance, desglose por categoría y tendencia de seis meses.
- Los meses se cortan en hora de Bogotá.
- Respaldo: descarga del historial completo en CSV para abrir en Excel.
- Ajustes: nombre, moneda propuesta al crear una cuenta, pantalla de inicio, tema claro/oscuro.
- Panel de administración: lista de personas y entrar a ver su cuenta, con aviso permanente y registro de cada acceso.

## Capabilities and Constraints

- Montos en `NUMERIC(19,4)`, viajan siempre como texto; nunca coma flotante.
- Movimientos inmutables; se anulan, no se editan. Solo la categoría se puede corregir.
- Multiusuario desde el esquema: nadie puede ver ni tocar los datos de otra persona. Un administrador ve la cuenta ajena solo convirtiéndose en esa persona, y desde ahí no puede escribir nada.
- Stack existente: Next.js + Tailwind/shadcn en `web/`, API Fastify, PostgreSQL (Neon), autenticación Neon Auth. Desplegado en Vercel.
- **Abierto, no decidido:** conexión con bancos e integraciones externas (congeladas en el plan del proyecto); apertura real a público, con términos y política de privacidad; entrar con Google.

## Brand Commitments

- El nombre **Cuadre** y la frase **"Que las cuentas cuadren"** no cambian.
- **Español de Colombia:** pesos colombianos, formato de montos local, fechas y meses en hora de Bogotá, voz en español cercano y sin jerga.
- **Los montos siempre visibles y exactos:** nunca abreviar ni redondear cifras (nada de "1,2 M"); se muestran completos y con su signo.

## Evidence on Hand

- Datos reales: los del dueño en producción; cuentas de prueba (`maria.prueba@ejemplo.com` con cuenta, movimientos y categorías) para ver pantallas pobladas.
- Iconos de la PWA generados en código: `web/src/app/icon.tsx`, `web/src/app/apple-icon.tsx`, `web/src/app/manifest.ts`.
- No hay logo diseñado, testimonios, clientes, capturas de prensa ni cifras de uso. No inventarlos.

## Product Principles

1. **Lo obvio le gana a lo potente.** Si una pantalla necesita explicación, está mal diseñada.
2. **La cifra es la verdad.** Un monto se muestra exacto, completo y sin ambigüedad sobre si es plata que entra o que sale.
3. **El historial no miente.** Las correcciones se ven; nada se esconde para que se vea más limpio.
4. **Rápido al registrar, claro al repasar.** Las dos situaciones de uso importan igual; ninguna se sacrifica por la otra.
5. **Lo de cada quien es de cada quien.** La privacidad no es una opción de ajustes, es cómo está hecho el producto.
