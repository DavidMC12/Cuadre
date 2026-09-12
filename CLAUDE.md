# Cuadre

> Que las cuentas cuadren.

App web de finanzas personales. Arranca como uso personal, evoluciona a
producto multiusuario con integraciones externas.

## Estilo de comunicación

Responde siempre en lenguaje simple y conversacional, evitando jerga técnica sin explicarla. Si algo es necesariamente técnico, tradúcelo a términos cotidianos y da ejemplos concretos cuando ayuden a entenderlo.

## Flujo de Git: permisos sobre la rama `main`

Este proyecto puede tener varios agentes trabajando al mismo tiempo, cada uno en su propia rama y en su propia copia aislada del proyecto (worktree), para no pisarse archivos entre sí. Reglas:

- Los sub-agentes que implementan una funcionalidad **nunca** tienen permiso de hacer `push`, merge, ni ningún cambio directo sobre `main`. Solo trabajan y suben cambios dentro de su propia rama.
- Solo el agente principal (con quien el usuario habla directamente) puede subir cambios a `main`, y únicamente cuando se cumplen **ambas** condiciones:
  1. El usuario dio permiso explícito para integrar esa rama/funcionalidad específica a `main`.
  2. El agente principal ya revisó y le confirmó al usuario que el cambio no choca ni con otras ramas activas ni con trabajo en curso de otros agentes.
- Cada funcionalidad se desarrolla en su propia copia/worktree separada del proyecto — nunca dos agentes comparten la misma carpeta de trabajo al mismo tiempo.
- **Los arreglos de errores también van en su propia rama**, por pequeños que parezcan. Nada se corrige escribiendo directo sobre `main`, ni siquiera un cambio de una línea: si vale la pena arreglarlo, vale la pena que quede revisado y con su historia aparte.
- Para que el perfil de GitHub del usuario se vea activo, se debe comitear seguido: cada vez que una parte pequeña y completa del trabajo esté lista (una función, una corrección, un ajuste), en vez de acumular varios cambios en un solo commit grande al final. No se deben crear commits vacíos o sin cambios reales solo para inflar el conteo.
- **Cada commit se sube (`push`) a su rama de inmediato**, en la misma acción, no al final de la sesión. Un commit que se queda en la máquina no existe para nadie más y no aparece en el perfil de GitHub. La primera vez en una rama nueva: `git push -u origin <rama>`; después, `git push` a secas. Si el push falla (por ejemplo, sin red), se avisa al usuario en vez de seguir acumulando commits en silencio.
- Esa regla de subir siempre aplica **solo a la rama propia**. `main` sigue intocable sin permiso explícito, según las dos condiciones de arriba.

## Revisión de código: nunca la hace quien escribió el código

Ninguna rama se integra a `main` sin revisión, y **quien revisa jamás es quien
escribió el cambio**. Un agente revisando su propio trabajo arrastra los mismos
supuestos que lo llevaron al error: no está leyendo el código, está recordando
lo que quiso escribir. Por eso la separación no es una formalidad, es de dónde
sale todo el valor de la revisión.

Cómo se hace, con las skills que ya están en el repositorio:

- Quien implementa termina su rama y pide la revisión con la skill
  **`requesting-code-review`**, que despacha un revisor aparte pasándole los SHA
  a comparar y el contexto mínimo — **nunca** el historial de la conversación en
  la que se escribió el código. Ese aislamiento es justamente el punto.
- El revisor es un agente distinto y sin memoria del trabajo previo. Si el
  cambio toca dinero o autenticación, se le pide con esfuerzo alto.
- Quien recibe los comentarios los procesa con la skill
  **`receiving-code-review`**: cada punto se verifica antes de aplicarlo. Ni se
  acepta por cortesía ni se descarta por orgullo; si un comentario está
  equivocado, se responde con el porqué.
- La revisión ocurre **antes** de pedirle permiso al usuario para integrar a
  `main`, no después. Lo que le llega al usuario ya viene revisado.
- Para una mirada más honda existe además `/code-review` (la skill del propio
  Claude Code), útil cuando el cambio es grande o el riesgo es alto.

## Principio rector

**Simplicidad para el usuario.** Si una pantalla necesita explicación, está
mal diseñada. Entre lo potente y lo obvio, gana lo obvio.

## Fases

**El proyecto está al 100% cuando la app le sirve a su dueño para llevar sus
cuentas.** Ese es el alcance completo, no una versión recortada de algo más
grande. Lo que viene después son pasos adicionales, opcionales, y ninguno se
empieza sin que él lo pida explícitamente.

### Hasta el 100%

| #   | Alcance                                    | Estado |
| --- | ------------------------------------------ | ------ |
| 0   | Esquema multi-tenant + migraciones         | hecha  |
| 1   | CRUD de movimientos, categorías, dashboard | hecha  |
| 2   | Autenticación y despliegue                 | hecha  |
| 3   | Uso real y ajustes de diseño               | activa |

### Pasos adicionales, ya pasado el 100%

Congelados. Que la fase anterior se vea terminada **no** es razón para
arrancar ninguno de estos: hace falta que el dueño lo diga con todas las
letras.

| #   | Alcance                                   | Por qué está afuera                                                                                                          |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 4   | Pruebas de punta a punta (Playwright)     | Las pruebas que ya existen cubren el dinero, que es lo que importa. Un navegador automatizado protege sobre todo del trabajo de otras personas sobre el mismo código, y aquí no hay otras personas. |
| 5   | Apertura a usuarios reales                | Cambia el proyecto de cosa personal a servicio: soporte, privacidad y costos ajenos. Se decide aparte, nunca por inercia. Aquí vive también el botón de "entrar con Google": con un solo dueño no le ahorra nada a nadie, y obliga a configurar credenciales en Google Cloud para mantener algo que hoy no se usa. |
| 6   | Integraciones externas + workers y outbox | Qué tanta falta hacen se sabe usando la app, no suponiéndolo antes.                                                          |

**El paso 5 ya está empezado a medias, y conviene saber qué parte.** El dueño
pidió el panel de administración *antes* de abrir la app, para tener la
herramienta lista cuando llegue gente. Así que existe `/admin`: la lista de
quién puede entrar y un botón para ver la app como esa persona, con registro
de cada vez que pasa. Lo que **no** está hecho del paso 5 es lo demás —
términos, política de privacidad, soporte, costos, registro abierto—, y sigue
congelado igual que antes.

El esquema es multi-tenant desde la Fase 0, aunque los usuarios de la Fase 5
quizá no lleguen nunca. Ya está hecho y quitarlo costaría más que dejarlo.

El orden no es caprichoso: la app se despliega y se usa de verdad (2 y 3) antes
de construir nada más. La importación de extractos CSV se sacó del plan por la
misma razón que el resto: vuelve solo si usar la app demuestra que hace falta.

Los workers y el outbox viven dentro de la fase de integraciones y no antes:
son la plomería que las hace seguras, y construirlos sin nada externo que
llamar sería una fase entera sin nada que mostrar.

## Protocolo de fase

Antes de escribir código en cualquier fase o integración, presentar y esperar
confirmación:

1. **Estimación** — tiempo total y desglose por tarea. Señalar qué es
   incierto y por qué.
2. **Paralelización** — cuántos subagentes lanzar y qué hace cada uno:
   - 1 agente: tareas acopladas o que tocan los mismos archivos
   - 2–3 agentes: módulos independientes (ej. backend / frontend / tests)
   - 4+: solo si son verdaderamente aislados. Justificarlo.
   - Nunca paralelizar sobre el módulo de dinero.
3. **Modelo y esfuerzo** — proponer y confirmar:
   - Haiku: scaffolding, boilerplate, renombrados
   - Sonnet: desarrollo normal de features
   - Opus: diseño de esquema, lógica de dinero, decisiones de arquitectura
   - Esfuerzo: bajo / medio / alto según el riesgo de la tarea
4. **Cuestionar el alcance** — si la fase se puede recortar sin perder
   valor, decirlo antes de empezar.

## Stack

- **Backend:** Node + Fastify + Drizzle + Zod
- **Frontend:** Next.js (App Router) + TanStack Query + Tailwind/shadcn + Recharts
- **DB:** PostgreSQL (Neon)
- **Auth:** Neon Auth / Auth.js — no construir autenticación propia
- **Jobs:** worker en el mismo proceso; se separa cuando compita con las requests
- **Móvil:** PWA responsive. No hay app nativa.
- **Infra:** Vercel Hobby (pantallas y API) + Neon Free (base) = $0/mes.
  Todo vive en la misma dirección, y eso quita de raíz tres problemas: CORS
  entre dominios, la sesión viajando entre dos servidores, y un servidor que se
  duerme por inactividad y tarda casi un minuto en despertar.
  Vercel Hobby es no comercial: al monetizar, migrar a Cloudflare Pages.

## Arquitectura

Monolito modular. Un deploy, módulos internos.

src/modules/
accounts/ bancos, tarjetas, efectivo
transactions/ movimientos (núcleo) + exportación del historial
categories/ catálogo + reglas automáticas
profile/ nombre y preferencias de quien usa la app
admin/ registro de quién entró a la cuenta de quién
imports/ parseo, preview, confirmación
reports/ dashboard y gráficas
budgets/ límites por categoría
integrations/ conectores externos y webhooks

Tres capas por módulo:

routes.ts HTTP: recibe, valida (Zod), responde
service.ts lógica de negocio. No conoce HTTP.
repository.ts SQL. Nada más.

**Regla:** un módulo nunca llama al repository de otro. Solo al service.

Sin microservicios. Sin CQRS. Sin event sourcing.

**Patrones:** Repository · Service layer · Strategy (proveedores externos) ·
Outbox (eventos a tabla en la misma transacción, worker los procesa después).

## Reglas no negociables

**Dinero**

- `NUMERIC(19,4)`, nunca float
- Movimientos inmutables: se corrige creando otro, jamás con `UPDATE`
- Los saldos se derivan, no se almacenan

**Multi-tenancy**

- `user_id` en toda tabla del núcleo
- `user_id` obligatorio en cada método del repository, nunca implícito
- **Ni siquiera un administrador lee los datos de otro con una consulta
  especial.** Para ver las cuentas de alguien, se convierte en esa persona
  (`/admin` → "Entrar") y usa la app tal cual: así toda consulta sigue pidiendo
  su `user_id`, igual que siempre. Unas pantallas de administración que leyeran
  movimientos de cualquiera serían la excepción a la regla de arriba, y las
  excepciones a esa regla son por donde se cuela una fuga. Si alguna vez hace
  falta un número agregado del sistema, se piensa dos veces antes de abrir esa
  puerta.
- Suplantar no da acceso al panel: durante la suplantación la sesión es la de
  la otra persona, así que `esAdmin` vale `false`. Es a propósito — si no,
  desde la cuenta de alguien se podría saltar a una tercera sin dejar rastro.
- **Desde la cuenta de otra persona solo se mira.** Cualquier método que
  escriba (`POST`, `PATCH`, `PUT`, `DELETE`) responde 403 mientras la sesión
  sea suplantada, y el corte está en el borde —por método, no ruta por ruta—
  para que una ruta nueva nazca protegida en vez de acordarse de protegerla.
  Con precisión: lo que queda cerrado es la API de Cuadre. El proveedor de
  identidad tiene su propia puerta (`/api/auth/*`), que no pasa por aquí.
  La razón es el libro de movimientos: no se edita, así que un gasto
  registrado por error en la cuenta equivocada queda escrito para siempre.
  Esa clase de error no se evita con cuidado, se evita haciéndolo imposible.

**Integraciones**

- Toda escritura acepta `Idempotency-Key`
- Webhooks: verificar firma HMAC, persistir crudo antes de procesar,
  deduplicar por `event_id` del proveedor
- Nunca llamar a una API externa dentro de una transacción de BD

**API** — versionada desde el primer endpoint: `/api/v1/`

**Seguridad**

- Secretos solo en variables de entorno
- CORS con lista blanca, nunca `*`
- Rate limiting, agresivo en login
- Tokens de integraciones cifrados en BD
- Nunca loguear montos, tokens ni datos de cuentas

## Testing

| Tipo                  | Framework                   | Desde |
| --------------------- | --------------------------- | ----- |
| Unitaria              | Vitest                      | F0    |
| Consistencia de datos | Vitest                      | F0    |
| Integración API       | Vitest + `fastify.inject()` | F1    |
| Integración BD        | Rama efímera de Neon        | F1    |
| Concurrencia          | Vitest                      | F1    |
| Componente            | Testing Library             | F3    |
| E2E                   | Playwright                  | F4    |
| Contrato              | MSW                         | F6    |

- **Consistencia:** el ledger cuadra contra los saldos calculados. En CI y
  como job diario en producción.
- **Concurrencia:** escrituras simultáneas sobre la misma cuenta sin perder
  actualizaciones.
- **Integración BD:** cada tanda de pruebas trabaja sobre una rama efímera de
  Neon, creada al empezar y borrada al terminar. Se descartó Testcontainers
  porque exige Docker en la máquina de desarrollo y porque una rama de Neon
  prueba contra el mismo Postgres exacto que corre en producción.

Cobertura alta en dinero e integraciones, laxa en handlers y UI. No perseguir
un porcentaje global.

## Convenciones

- SQL visible vía Drizzle; sin abstracciones que lo escondan
- Validación con Zod en el borde
- Migraciones versionadas; nunca modificar una ya aplicada
- La misma imagen Docker en local y producción; solo cambian las env vars
- `docker compose up` levanta todo, migraciones incluidas
- Backup: `pg_dump` semanal fuera de la plataforma
