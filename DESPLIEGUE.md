# Desplegar Cuadre en Vercel

Este documento explica cómo queda armado el despliegue y qué tiene que hacer
**a mano** quien tenga la cuenta de Vercel. Nadie más puede hacer estos pasos
por él: hacen falta sus credenciales.

## Cómo queda armado

Pantallas (Next.js, carpeta `web/`) y API (Fastify, carpeta `src/`) son **dos
proyectos separados de Vercel**, del mismo repositorio, unidos para que se
vean como un solo sitio:

- El proyecto de las **pantallas** (`web/` como Root Directory) es el que la
  gente visita. Su propio `web/vercel.json` reenvía (`rewrites`) todo lo que
  empiece en `/api/v1/...`, y también `/salud` (hacia `/api/salud` del lado
  de la API — ver la nota sobre esa ruta más abajo).
- El proyecto de la **API** (Root Directory vacío, o sea la raíz del
  repositorio) no se ve nunca directamente: el navegador solo habla con el
  proyecto de las pantallas, que reenvía por dentro.

Como el navegador solo ve **una** dirección (la del proyecto de pantallas),
no hace falta configurar CORS entre dominios distintos, y la cookie de sesión
(de Neon Auth) funciona sin trucos — es el mismo truco que un reenvío interno
en un solo servidor, solo que acá son dos proyectos de Vercel.

### Por qué no usamos la función "Services" de Vercel

Vercel tiene una función llamada ["Services"](https://vercel.com/docs/services)
pensada justo para este caso (varios servicios bajo un mismo proyecto). La
probamos primero porque es más simple de administrar (un solo proyecto), pero
en nuestro caso el servicio de la API fallaba en cada petición con
`INTERNAL_FUNCTION_INVOCATION_FAILED`, sin ningún log de la aplicación. En su
momento sospeché que era por la superposición de carpetas entre los dos
servicios (la API usaba como raíz el repositorio completo, que contiene
`web/` adentro) — esa sospecha resultó **equivocada**.

La causa real, confirmada después corriendo `vercel build` en la máquina
local e inspeccionando el archivo de rutas que genera: el builder de Fastify
de Vercel arma automáticamente una regla que dice "todo lo que no empiece en
`/api/` es un archivo estático, y si no existe, es un 404". Nuestra ruta de
salud vivía en `/salud`, sin ese prefijo — caía en esa regla, y como no hay
ningún archivo `404.html` en un proyecto que es puramente una API, Vercel no
lograba resolver ni siquiera el 404, y eso se manifestaba como
`INTERNAL_FUNCTION_INVOCATION_FAILED`. Esto habría fallado exactamente igual
con "Services" — no tenía nada que ver con la superposición de carpetas. El
arreglo real fue mover esa ruta a `/api/salud` (ver más abajo).

Como el cambio a dos proyectos separados ya estaba hecho y funciona (y no
depende de una función en beta), lo dejamos así en vez de volver a un solo
proyecto con "Services" — pero vale la pena que quede claro que la causa
original que se documentó acá estaba mal, para no repetir esa pista falsa si
en el futuro se reconsidera.

### La ruta de salud vive en `/api/salud`, no en `/salud`

Por la misma razón de arriba: el código de Fastify (`src/aplicacion.ts`)
registra el chequeo de salud como `/api/salud`, no como `/salud` a secas. El
proyecto de pantallas sigue exponiendo `/salud` hacia afuera (es más simple
de recordar para quien monitorea el sitio) y por dentro lo reenvía a
`/api/salud` — ver `web/vercel.json`.

### Por qué no hizo falta escribir un "adaptador" para Fastify

Vercel sabe correr una app de Fastify tal cual, sin envolverla en nada,
siempre que el archivo que arranca el servidor tenga uno de un puñado de
nombres reconocidos (`src/server.ts` entre ellos) y llame a `app.listen(...)`
— exactamente lo que `src/server.ts` ya hace hoy. Los detalles están en la
[guía de Vercel para Fastify](https://vercel.com/docs/frameworks/backend/fastify).

Un detalle no tan obvio: esa detección busca, en este orden, `src/app.*`,
`src/index.*`, `src/server.*` (y las mismas tres en la raíz). Como el
proyecto ya tenía un `src/app.ts` —que exporta `construirApp`, no un
servidor arrancado— Vercel lo tomaba a **él** como entrypoint en vez de
`src/server.ts`, y fallaba con "Invalid export found... The default export
must be a function or server". Por eso ese archivo pasó a llamarse
`src/aplicacion.ts`: mismo contenido, solo para que no calce con ninguno de
los nombres que Vercel reconoce.

### El pool de conexiones a Postgres

Sí hizo falta un ajuste chico en `src/db/client.ts`: bajé el `max` del pool
de conexiones de Postgres de 10 a 5. El detalle completo está en el informe
más abajo ("Decisiones que tomé").

## Variables de entorno a cargar en Vercel

Cada proyecto tiene **sus propias** variables — se cargan en **Project
Settings → Environment Variables** de cada uno por separado. Ninguna va en un
archivo que se suba al repositorio.

### Proyecto de la API (Root Directory vacío)

| Variable                  | Para qué sirve                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Cadena de conexión a la base de datos en Neon. Tiene que ser la que trae `-pooler` en el nombre del servidor (el mismo host que ya usas en local).                                                                                        |
| `NODE_ENV`                  | Poné `production`.                                                                                                                                                                                                                          |
| `CORS_ORIGINS`              | La dirección del proyecto de **pantallas** (por ejemplo `https://cuadre-web-tuusuario.vercel.app`), no la de este mismo proyecto. Se conoce recién después del paso 4 de abajo. Nunca `*`.                                                |
| `NEON_AUTH_BASE_URL`        | Dirección del servicio de autenticación (Neon Auth / Better Auth). Ya la tenés en tu `.env` local; es la misma.                                                                                                                            |
| `NEON_AUTH_COOKIE_SECRET`   | Secreto para firmar la cookie de sesión. Ya la tenés en tu `.env` local; es la misma. **Nunca la muestres ni la pegues en un chat o log.**                                                                                                 |

No hace falta `PORT` (Vercel lo maneja solo) ni `NEON_API_KEY` /
`NEON_PROJECT_ID` (son solo para que las pruebas automáticas creen una base
de datos descartable).

### Proyecto de las pantallas (Root Directory `web/`)

| Variable                | Para qué sirve                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`    | La dirección completa de **este mismo proyecto** de pantallas (por ejemplo `https://cuadre-web-tuusuario.vercel.app`), no la de la API. Se define recién en el paso 5. |

> **Nota:** aunque las peticiones terminen en la API, el navegador solo habla
> con el proyecto de pantallas (el `vercel.json` de `web/` reenvía por
> dentro) — por eso acá va la dirección de las pantallas, no la de la API.

## Pasos que tenés que hacer vos, a mano, en tu cuenta de Vercel

En este orden:

1. **En el proyecto que ya existe (`cuadre-tau.vercel.app`, la API):**
   - Andá a **Settings → Build and Deployment → Framework Preset** y
     cambialo de "Services" a lo que Vercel detecte solo (debería ofrecer
     "Fastify" o similar al quitar el `vercel.json` de la raíz).
   - Confirmá que **Root Directory** siga vacío.
   - Dejá `CORS_ORIGINS` con el valor provisional que tenga por ahora (lo
     corregís en el paso 5).
   - Volvé a desplegar (Deployments → el más reciente → Redeploy) para que
     tome el `vercel.json` de la raíz eliminado.
2. **Crear el proyecto nuevo de las pantallas.** Vercel → Add New → Project
   → el mismo repositorio de GitHub → esta vez elegí **Root Directory =
   `web`**. Vercel debería detectar Next.js solo.
3. **Desplegar por primera vez.** Con eso Vercel le asigna una dirección al
   proyecto de pantallas (algo como `https://cuadre-web-tuusuario.vercel.app`).
   Copiála.
4. **Volver a Environment Variables del proyecto de pantallas** y cargar:
   - `NEXT_PUBLIC_API_URL` = la dirección del paso 3, sin barra al final.

   Como queda "horneada" dentro del código al momento de construir, hace
   falta **volver a desplegar** (Deployments → el más reciente → Redeploy)
   para que el cambio tome efecto.
5. **Volver a Environment Variables del proyecto de la API** y cargar:
   - `CORS_ORIGINS` = la misma dirección del paso 3 (reemplazando el valor
     provisional). Volvé a desplegar ese proyecto también.
6. **Si vas a usar un dominio propio** (en vez del `.vercel.app`), agregalo
   en el proyecto de **pantallas** en Settings → Domains, y repetí el paso 4
   con esa dirección en vez de la de Vercel.
7. **Avisale al agente principal la dirección final** (la del proyecto de
   pantallas, la que la gente va a visitar). Le hace falta para agregarla a
   `trusted_origins` en `neon_auth.project_config` — eso es trabajo suyo, no
   tuyo, pero necesita saber la dirección real.

## Qué verifiqué sin desplegar

- `npm run typecheck` en la raíz: pasa limpio.
- `npm run build` en `web/`: pasa limpio (compila y genera las páginas
  estáticas).
- La sintaxis de reenvío externo en `web/vercel.json` (`source`/`destination`
  con una URL completa) es una función estable de Vercel, no beta — la
  confirmé contra su documentación actual.

Lo que **no pude** verificar por no tener cuenta de Vercel: que el despliegue
real funcione de punta a punta (esa es la parte que le toca al usuario en los
pasos de arriba).
