# Cuadre

> Que las cuentas cuadren.

App web de finanzas personales.

**Estado: en uso.** Ya puedes registrar un gasto y ver tu saldo desde el
celular, entrando con tu cuenta, sin encender nada en tu máquina. Lo que queda
son los ajustes de diseño que salgan de usarla a diario.

## Qué necesitas

- Node 22 o superior
- Una base de datos PostgreSQL. El proyecto usa [Neon](https://neon.tech) en su
  plan gratuito.

## Cómo arrancar

```bash
npm install
cp .env.example .env      # y pega tu cadena de conexión de Neon
npm run db:migrate        # crea las tablas y las reglas
npm test                  # comprueba que todo quedó bien
```

Para usarlo hacen falta dos cosas encendidas, cada una en su terminal:

```bash
npm run dev               # la API, en localhost:3001
cd web && npm run dev     # las pantallas, en localhost:3000
```

Abre `localhost:3000` y ya está. Está pensado para el celular, así que si lo
miras en el computador vale la pena angostar la ventana.

El archivo `.env` guarda la contraseña de tu base de datos y **nunca se sube a
Git**. Si alguna vez se te escapa, la puedes cambiar desde el panel de Neon sin
perder nada.

## Comandos

| Comando               | Qué hace                                                      |
| --------------------- | ------------------------------------------------------------- |
| `npm run dev`         | Levanta la API en localhost:3001                              |
| `npm test`            | Corre todas las pruebas                                       |
| `npm run test:list`   | Lista qué garantiza cada prueba, sin correrlas                |
| `npm run db:generate` | Escribe una migración nueva a partir de cambios en el esquema |
| `npm run db:migrate`  | Aplica a la base las migraciones que falten                   |
| `npm run db:studio`   | Abre un visor para mirar los datos                            |
| `npm run admin`       | Da o quita permiso de administrador a una cuenta              |
| `npm run typecheck`   | Revisa que no haya errores de tipos                           |
| `npm run format`      | Ordena el formato del código                                  |

## Cómo está organizado el dinero

Cuatro tablas: **usuarios**, **cuentas**, **categorías** y **movimientos**.
Tres ideas sostienen todo lo demás.

**El saldo no se guarda en ninguna parte.** No hay una columna que diga cuánta
plata tiene una cuenta. El saldo se calcula sumando los movimientos, cada vez
que se consulta. Por eso es imposible que el saldo y el detalle se contradigan:
el saldo _es_ el detalle. Hasta la plata con la que arranca una cuenta se
registra como un movimiento, el de apertura.

**Los movimientos no se editan nunca.** Si registraste mal un gasto, no se
corrige encima: se registra otro movimiento que lo anula, con el monto opuesto,
y si hace falta uno nuevo con el dato bueno. El historial siempre cuenta lo que
de verdad pasó, incluidos los errores y sus correcciones. Esto no es una buena
intención del código: hay un disparador en Postgres que rechaza cualquier
intento de editar o borrar una fila del libro de movimientos.

**Mover plata entre cuentas propias no es ni ingreso ni gasto.** Pasar dinero
del banco al efectivo son dos movimientos hermanos —uno que sale y otro que
entra— que suman cero y no llevan categoría. La base exige que sean
exactamente dos, en dos cuentas distintas, en la misma moneda, y que cuadren.

Además, todas las llaves foráneas incluyen el `user_id`, así que la base misma
impide que un movimiento apunte a la cuenta o la categoría de otra persona.
La de cuenta incluye también la moneda: un movimiento no puede quedar en una
divisa distinta a la de su cuenta.

Las pruebas de `npm test` existen justamente para intentar romper cada una
de estas reglas y comprobar que la base no lo permite.

## Tus datos son tuyos

En **Ajustes → Respaldo** te bajas todo el historial en un archivo que abre
Excel. No es un resumen ni una muestra: son todos los movimientos, con los
montos exactos y las correcciones visibles, para que el archivo cuente la misma
historia que la app —errores incluidos—. Un respaldo que redondea cifras o que
esconde lo que se anuló deja de ser un respaldo.

Ahí mismo están tu nombre, la moneda que la app te propone al registrar, con
qué pantalla abre, y el tema claro u oscuro.

## Administración

Si tu cuenta tiene permiso de administrador, en **Ajustes → Personas** ves
quién usa Cuadre y puedes entrar a su cuenta para ayudarle: ves lo mismo que
ve esa persona —sus movimientos, sus saldos, todo— con un aviso rojo
permanente arriba que no se puede cerrar, para que nunca registres un gasto
creyendo que es tuyo.

No hay pantallas que lean los datos de varias personas a la vez, y es a
propósito: en vez de eso te *conviertes* en esa persona, así que cada consulta
sigue pidiendo su identificador igual que siempre y la regla de que nadie ve lo
ajeno queda intacta. Cada vez que entras a una cuenta queda un registro con
quién, a quién y cuándo.

El primer administrador se nombra a mano, porque para entrar al panel hay que
serlo ya:

```bash
npm run admin -- tucorreo@ejemplo.com admin   # dar permiso
npm run admin -- tucorreo@ejemplo.com user    # quitarlo
```

## Las pruebas son la documentación

No hay un documento aparte que liste qué está garantizado, y es a propósito: un
documento así se desactualiza en silencio. Alguien borra una prueba y el
documento sigue jurando que existe.

En vez de eso, las pruebas se llaman como frases en español —"exige el monto
opuesto", "no deja anular una anulación", "el saldo de un usuario no se
contamina con el de otro"— y se leen todas de un tirón con:

```bash
npm run test:list
```

Esa lista sale del código que de verdad corre, así que no puede mentir. Si una
garantía desaparece, desaparece de la lista sola.

## Estructura

```
drizzle/            migraciones (SQL versionado, nunca se modifica una aplicada)
src/db/schema/      definición de las tablas
src/db/reglas.test  pruebas de consistencia contra la base real
src/shared/money    aritmética de dinero exacta, sin coma flotante
src/env.ts          variables de entorno, validadas al arrancar
src/http/           esqueleto HTTP y traduccion de errores
src/modules/        cuentas, movimientos, categorías y perfil, en tres capas cada uno
web/                las pantallas (Next.js)
```

Las decisiones de arquitectura y el plan por fases están en
[`CLAUDE.md`](./CLAUDE.md).
