# Desplegar Cuadre en Vercel

Este documento explica cómo queda armado el despliegue y qué tiene que hacer
**a mano** quien tenga la cuenta de Vercel. Nadie más puede hacer estos pasos
por él: hacen falta sus credenciales.

## Cómo queda armado

Pantallas (Next.js, carpeta `web/`) y API (Fastify, carpeta `src/`) salen de
**un solo proyecto de Vercel**, bajo **una sola dirección**. Eso lo logra
`vercel.json` en la raíz usando una función de Vercel llamada
["Services"](https://vercel.com/docs/services): dentro de un mismo proyecto,
declara dos partes independientes —la llamamos `api` y `web`— cada una con su
propia carpeta y su propio `package.json`, y reparte el tráfico entre ellas
por dirección:

- Lo que empiece en `/api/...` (o sea `/salud`, el chequeo de salud) va a
  `api`: la carpeta `src/`, tal cual existe hoy. No hubo que reescribir nada.
- Todo lo demás va a `web`: la carpeta `web/`, tal cual existe hoy.

Como quedan bajo la misma dirección, el navegador ve la pantalla y la API
como el mismo sitio: no hace falta configurar CORS entre dominios distintos,
y la cookie de sesión (de Neon Auth) funciona sin trucos.

### Por qué no hizo falta escribir un "adaptador" para Fastify

Vercel sabe correr una app de Fastify tal cual, sin envolverla en nada,
siempre que el archivo que arranca el servidor tenga uno de un puñado de
nombres reconocidos (`src/server.ts` entre ellos) y llame a `app.listen(...)`
— exactamente lo que `src/server.ts` ya hace hoy. Los detalles están en la
[guía de Vercel para Fastify](https://vercel.com/docs/frameworks/backend/fastify).
No toqué `src/app.ts`, `src/server.ts` ni ningún módulo.

### El pool de conexiones a Postgres

Sí hizo falta un ajuste chico en `src/db/client.ts`: bajé el `max` del pool
de conexiones de Postgres de 10 a 5. El detalle completo está en el informe
más abajo ("Decisiones que tomé").

## Variables de entorno a cargar en Vercel

Se cargan en **Project Settings → Environment Variables**. Ninguna va en un
archivo que se suba al repositorio.

| Variable                 | Para qué sirve                                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | Cadena de conexión a la base de datos en Neon. Tiene que ser la que trae `-pooler` en el nombre del servidor (el mismo host que ya usas en local): es la que soporta muchas conexiones cortas a la vez, que es justo lo que hace Vercel. |
| `NODE_ENV`                 | Poné `production`. Cambia el nivel de detalle de los logs y algunos mensajes de error.                                                                                                                                                    |
| `CORS_ORIGINS`             | Lista de direcciones que pueden llamar a la API, separadas por comas. Poné la dirección de producción que Vercel te asigne (ver paso 5 más abajo). Nunca `*`.                                                                             |
| `NEON_AUTH_BASE_URL`       | Dirección del servicio de autenticación (Neon Auth / Better Auth). Ya la tenés en tu `.env` local; es la misma.                                                                                                                            |
| `NEON_AUTH_COOKIE_SECRET`  | Secreto para firmar la cookie de sesión. Ya la tenés en tu `.env` local; es la misma. **Nunca la muestres ni la pegues en un chat o log.**                                                                                                 |
| `NEXT_PUBLIC_API_URL`      | Dirección base que usan las pantallas para llamar a la API. En producción tiene que ser la dirección completa de tu propio sitio (por ejemplo `https://cuadre.vercel.app`), **no vacía** — ver la nota abajo. Se define recién en el paso 6, después del primer despliegue. |

No hace falta cargar `PORT` (Vercel decide el puerto por su cuenta) ni
`NEON_API_KEY` / `NEON_PROJECT_ID` (esas dos son solo para que las pruebas
automáticas creen una base de datos descartable; no las usa la app en
producción).

> **Nota sobre `NEXT_PUBLIC_API_URL`:** revisé `web/src/lib/api/client.ts` (no
> lo toqué, es territorio del agente de pantallas) y arma las direcciones con
> `new URL(base + ruta)`. Esa función exige una dirección completa
> (`https://algo`); una cadena vacía la rompe. Por eso la instrucción de abajo
> es poner ahí la dirección completa de producción, no dejarla vacía — igual
> sigue siendo "la misma dirección" a ojos del navegador, así que no
> reaparece el problema de CORS que se evitó con Services.

## Pasos que tenés que hacer vos, a mano, en tu cuenta de Vercel

En este orden:

1. **Importar el repositorio.** Andá a Vercel → Add New → Project → elegí el
   repositorio de Cuadre en GitHub.
2. **Elegir el framework "Services".** `vercel.json` ya declara los dos
   servicios (`api` y `web`), pero por las dudas: si en la pantalla de
   configuración del proyecto no queda elegido solo, andá a **Settings →
   Build and Deployment → Framework Preset** y elegí **Services** a mano.
   > Esta función de Vercel está en beta con "permisos requeridos" según su
   > propia documentación. Si no aparece disponible en tu cuenta, hay un plan
   > B más abajo ("Si 'Services' no está disponible").
3. **Dejar "Root Directory" vacío.** No lo cambies a `web` ni a ninguna otra
   carpeta — tiene que apuntar a la raíz del repositorio, porque
   `vercel.json` ya le dice a cada servicio en qué carpeta vive.
4. **Cargar las variables de entorno** de la tabla de arriba, salvo
   `NEXT_PUBLIC_API_URL` (esa todavía no la sabés). Usá los valores que ya
   tenés en tu `.env` local para `DATABASE_URL`, `NEON_AUTH_BASE_URL` y
   `NEON_AUTH_COOKIE_SECRET`, y poné `CORS_ORIGINS=http://localhost:3000`
   como valor provisional (lo corregís en el paso 6).
5. **Desplegar por primera vez.** Con eso Vercel te asigna una dirección
   (algo como `https://cuadre-tu-usuario.vercel.app`). Copiála.
6. **Volver a Environment Variables** y cargar:
   - `NEXT_PUBLIC_API_URL` = la dirección del paso 5, sin barra al final.
   - `CORS_ORIGINS` = la misma dirección (reemplazando el valor provisional).

   Como `NEXT_PUBLIC_API_URL` queda "horneada" dentro del código de las
   pantallas al momento de construirlas, hace falta **volver a desplegar**
   (Deployments → el despliegue más reciente → Redeploy) para que el cambio
   tome efecto.
7. **Si vas a usar un dominio propio** (en vez del `.vercel.app`), agregalo
   en Settings → Domains, y repetí el paso 6 con esa dirección en vez de la
   de Vercel.
8. **Avisale al agente principal la dirección final.** Le hace falta para
   agregarla a `trusted_origins` en `neon_auth.project_config` — eso es
   trabajo suyo, no tuyo, pero necesita saber la dirección real.

### Si "Services" no está disponible en tu cuenta

Plan B, sin tocar `vercel.json` de este mismo modo: crear **dos** proyectos
de Vercel a partir del mismo repositorio —uno con Root Directory `web`
(las pantallas) y otro con Root Directory vacío (la API, que ya se
autodetecta como Fastify)— y en el proyecto de las pantallas agregar un
`rewrites` en su propio `vercel.json` (dentro de `web/`) que mande
`/api/(.*)` y `/salud` a la dirección `.vercel.app` del proyecto de la API.
El resultado es equivalente (una sola dirección visible), pero son dos
proyectos separados en el dashboard, con sus variables de entorno cargadas
por separado en cada uno. Si llegás a este punto, avisale al agente
principal antes de armarlo: ese `vercel.json` extra viviría dentro de
`web/`, que no es mi territorio.

## Qué verifiqué sin desplegar

- `npm run typecheck` en la raíz: pasa limpio.
- `npm run build` en `web/`: pasa limpio (compila y genera las 7 páginas
  estáticas).
- `vercel.json` es JSON válido y sigue la forma documentada de `services` +
  `rewrites` con destino `{ "service": "..." }`.

Lo que **no pude** verificar por no tener cuenta de Vercel: que el despliegue
real funcione de punta a punta (esa es la parte que le toca al usuario en los
pasos de arriba).
