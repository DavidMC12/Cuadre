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
  empiece en `/api/v1/...`, y también `/salud`, hacia el proyecto de la API.
- El proyecto de la **API** (Root Directory vacío, o sea la raíz del
  repositorio) no se ve nunca directamente: el navegador solo habla con el
  proyecto de las pantallas, que reenvía por dentro.

Como el navegador solo ve **una** dirección (la del proyecto de pantallas),
no hace falta configurar CORS entre dominios distintos, y la cookie de sesión
(de Neon Auth) funciona sin trucos — es el mismo truco que un reenvío interno
en un solo servidor, solo que acá son dos proyectos de Vercel.

### La API es una función escrita a mano, no la detección automática de Vercel para Fastify

Esto cambió varias veces mientras se armaba el despliegue, así que vale la
pena explicar bien cómo se llegó acá.

Vercel sabe reconocer una app de Fastify sola (sin `vercel.json`, sin nada) y
convertirla en una función: basta con que el archivo de arranque tenga uno de
un puñado de nombres reconocidos y llame a `app.listen(...)`. Se probó ese
camino primero, y falló de maneras distintas y cada vez más difíciles de
diagnosticar:

1. **TypeScript 7 no compatible** con la herramienta de Vercel que revisa
   tipos — se bajó a la versión 5.9.3 estable.
2. **El detector confundía `src/app.ts` con el archivo de arranque** (busca,
   en orden, `src/app.*`, `src/index.*`, `src/server.*`) — se renombró a
   `src/aplicacion.ts`.
3. **Exigía que el archivo de arranque importara literalmente `fastify`**,
   no le alcanzaba con importarlo a través de otro módulo.
4. **Todo lo que no empieza en `/api/` lo trataba como archivo estático**, y
   como este proyecto no tiene ningún archivo estático real, ni el 404 se
   resolvía — la función fallaba en cada petición con
   `INTERNAL_FUNCTION_INVOCATION_FAILED`, sin ningún log de la aplicación
   (nunca llegaba a correr nuestro código). Por eso, en un momento, la ruta
   de salud pasó a vivir en `/api/salud` en vez de `/salud`.
5. **Incluso arreglado todo lo anterior, la función seguía fallando** —
   invocarla se colgaba unos 60 segundos y terminaba en el mismo error. Sin
   ninguna línea de log de la aplicación (ni `console.error` puesto a mano
   en el arranque), lo que fallaba pasaba antes de que corriera una sola
   línea de nuestro código.

Con acceso directo a la cuenta de Vercel (`vercel login` + `vercel build`
local para inspeccionar exactamente qué arma el builder), se confirmó que el
problema era el builder específico de Fastify (`@vercel/fastify`) en sí, no
algo arreglable desde nuestro código. La solución fue dejar de depender de
esa detección por completo:

- El **Framework Preset** del proyecto de la API quedó en **"Other"** (no
  "Fastify"), así Vercel no intenta la detección especial.
- `api/backend.ts` es la única función de verdad: un archivo chico que arma
  la misma app de Fastify (`construirApp()`) y, en vez de escuchar en un
  puerto, le pasa cada petición directo emitiendo el evento `'request'` que
  Fastify ya escucha internamente (`app.server.emit('request', ...)`). Esto
  es la convención más básica de Vercel — cualquier archivo bajo `/api/` es
  una función — sin ninguna detección de framework de por medio.
- El `vercel.json` de la raíz reenvía `/api/v1/*` y `/api/salud` hacia esa
  única función, con `rewrites` (la misma herramienta ya usada en
  `web/vercel.json`). Se probó primero con nombres de archivo dinámicos
  (`api/[...ruta].ts`), pero esa forma resultó tener un límite de un solo
  segmento en la versión del builder que usa este proyecto —
  `/api/v1/movimientos` funcionaba pero `/api/v1/movimientos/algo` daba 404.
  Los `rewrites` de `vercel.json` sí soportan varios segmentos sin problema
  (`:path*`), así que el archivo de la función quedó fijo (`api/backend.ts`)
  y toda la lógica de "qué ruta va a dónde" vive en `vercel.json`.

Como la función recibe la petición con su URL original intacta (el reenvío
no la reescribe), Fastify sigue decidiendo qué ruta es cada cosa exactamente
igual que siempre — nada cambió en `src/aplicacion.ts` ni en ningún módulo
de rutas por esto.

### Por qué tampoco usamos la función "Services" de Vercel

Se probó también ["Services"](https://vercel.com/docs/services) (un solo
proyecto de Vercel con dos servicios internos) antes de pasar a dos
proyectos separados. Falló con el mismo problema del punto 4 de arriba (el
prefijo `/api/`) — no tenía nada que ver, como se sospechó en su momento,
con que los dos servicios compartieran carpetas. Como el cambio a dos
proyectos separados ya estaba hecho y funciona, y no depende de una función
en beta, se quedó así.

### El proxy de las pantallas (`web/src/proxy.ts`) tiene que dejar pasar `/salud` y `/api/v1/*`

El middleware que protege las pantallas (redirige a `/entrar` sin sesión) por
defecto interceptaba también estas dos rutas, porque no estaban en su lista
de excepciones — el monitor de salud y las llamadas de la API terminaban
recibiendo una redirección HTML en vez de la respuesta real. Se agregaron a
la lista de rutas que el proxy ni siquiera mira.

### El pool de conexiones a Postgres

Un ajuste chico en `src/db/client.ts`: el `max` del pool bajó de 10 a 5 (cada
instancia que Vercel levanta abre su propio pool, y con uso personal no hace
falta reservar tantas conexiones), y se agregó `connect_timeout: 10` — sin
eso, una conexión que no puede completarse se queda colgada con el timeout
por defecto del sistema operativo en vez de fallar rápido y con un error
claro.

## Variables de entorno a cargar en Vercel

Cada proyecto tiene **sus propias** variables — se cargan en **Project
Settings → Environment Variables** de cada uno por separado. Ninguna va en un
archivo que se suba al repositorio.

### Proyecto de la API (Root Directory vacío, Framework Preset "Other")

| Variable                  | Para qué sirve                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Cadena de conexión a la base de datos en Neon. Tiene que ser la que trae `-pooler` en el nombre del servidor (el mismo host que ya usas en local).                                                                                        |
| `NODE_ENV`                  | Poné `production`.                                                                                                                                                                                                                          |
| `CORS_ORIGINS`              | La dirección del proyecto de **pantallas** (por ejemplo `https://cuadre-web-tuusuario.vercel.app`), no la de este mismo proyecto. Nunca `*`.                                                                                              |
| `NEON_AUTH_BASE_URL`        | Dirección del servicio de autenticación (Neon Auth / Better Auth). Ya la tenés en tu `.env` local; es la misma.                                                                                                                            |
| `NEON_AUTH_COOKIE_SECRET`   | Secreto para firmar la cookie de sesión. Ya la tenés en tu `.env` local; es la misma. **Nunca la muestres ni la pegues en un chat o log.**                                                                                                 |

No hace falta `PORT` (Vercel lo maneja solo) ni `NEON_API_KEY` /
`NEON_PROJECT_ID` (son solo para que las pruebas automáticas creen una base
de datos descartable).

### Proyecto de las pantallas (Root Directory `web/`)

| Variable                | Para qué sirve                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`    | La dirección completa de **este mismo proyecto** de pantallas (por ejemplo `https://cuadre-web-tuusuario.vercel.app`), no la de la API.                                |

> **Nota:** aunque las peticiones terminen en la API, el navegador solo habla
> con el proyecto de pantallas (el `vercel.json` de `web/` reenvía por
> dentro) — por eso acá va la dirección de las pantallas, no la de la API.

## Estado actual

Los dos proyectos ya existen y están desplegados y verificados de punta a
punta (con acceso directo a la cuenta, vía `vercel login`):

- API: `cuadre` → `https://cuadre-tau.vercel.app` — Framework Preset "Other".
- Pantallas: `cuadre-web` → `https://cuadre-web-three.vercel.app` — Root
  Directory `web`.

Si hace falta un dominio propio (en vez de `.vercel.app`), se agrega en el
proyecto de **pantallas** en Settings → Domains, y hay que:

1. Cargar `NEXT_PUBLIC_API_URL` en el proyecto de pantallas con esa nueva
   dirección, y volver a desplegar (queda "horneada" en el código al
   construir).
2. Cargar `CORS_ORIGINS` en el proyecto de la API con esa misma dirección, y
   volver a desplegar.
3. Avisarle al agente principal la dirección final — hace falta agregarla a
   `trusted_origins` en `neon_auth.project_config`.

## Qué se verificó

Con `vercel login` y acceso directo a la cuenta, no solo simulando el build:

- `npm run typecheck` y `npm run build` (en `web/`): pasan limpios.
- `vercel build --prod` local, inspeccionando `.vercel/output/config.json`
  para confirmar que las rutas generadas son las esperadas antes de cada
  intento de despliegue real.
- Despliegue real a producción (`vercel deploy --prod --force`) de ambos
  proyectos.
- `GET /api/salud` y `GET /salud` (a través del proyecto de pantallas):
  `200`.
- `GET /api/v1/accounts` (a través del proyecto de pantallas, sin sesión):
  `401` en JSON — la ruta enruta bien y la API responde, no un error de
  Vercel.
- `GET /` sin sesión: redirige a `/entrar` (el proxy sigue protegiendo las
  pantallas normales).
