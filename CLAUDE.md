# Cuadre

> Que las cuentas cuadren.

App web de finanzas personales. Arranca como uso personal, evoluciona a
producto multiusuario con integraciones externas.

## Estilo de comunicación

Lenguaje simple y conversacional, sin jerga sin explicar. Lo técnico se
traduce a términos cotidianos, con ejemplos concretos.

## Flujo de Git: permisos sobre `main`

Varios agentes trabajan a la vez, cada uno en su propia rama y worktree
(nunca comparten carpeta).

- Los sub-agentes **nunca** hacen `push`/merge a `main`; solo suben a su
  propia rama, y lo hacen de inmediato al comitear (no al final de la
  sesión) — primer push `git push -u origin <rama>`, luego `git push`. Push
  fallido se avisa, no se acumula en silencio.
- Solo el agente principal integra a `main`, y lo hace sin pedir permiso
  caso por caso en cuanto: la rama ya fue revisada (ver abajo) y los
  hallazgos atendidos, y no choca con otras ramas/trabajo en curso. Como
  Vercel despliega automático desde `main`, cada integración pasa a
  producción sin pausa previa.
- Hasta los arreglos de un error van en su propia rama, por chicos que sean.
- Comitear seguido (cada pieza chica y completa, no un commit gigante al
  final) para que el perfil de GitHub se vea activo — sin commits vacíos.

## Revisión de código: nunca la hace quien escribió el cambio

Quien revisa jamás es quien escribió: revisarse a sí mismo arrastra los
mismos supuestos que llevaron al error.

- Quien implementa pide la revisión con la skill `requesting-code-review`,
  que despacha un revisor aparte con los SHA y el contexto mínimo — nunca el
  historial de la conversación donde se escribió el código.
- El revisor no tiene memoria del trabajo previo. Esfuerzo alto si el cambio
  toca dinero o autenticación.
- Quien recibe los comentarios los procesa con `receiving-code-review`: cada
  punto se verifica antes de aplicarlo (ni cortesía, ni orgullo).
- La revisión ocurre antes de integrar a `main`; el agente principal
  fusiona sin esperar confirmación aparte y avisa qué quedó integrado.
- `/code-review` (Claude Code) para una mirada más honda en cambios grandes
  o de riesgo alto.

## Entorno de trabajo: Herdr

Desde 2026-09-16 el trabajo corre en Herdr: paneles de terminal, cada uno con
su worktree — el "supervisor" (con quien habla el dueño) y uno o más workers
de OpenCode (`worker1`, `worker2`, ...).

**El supervisor optimiza tokens de Claude, no líneas de código.** Un worker
es el recurso barato; el supervisor es el caro. Por eso el supervisor solo
**reparte órdenes** — define la tarea, entrega un encargo completo y
autocontenido a cada worker, decide cuándo fusionar a `main` — y deja que el
worker **planee, implemente, pida su propia revisión y entregue el
resultado terminado**. El supervisor no escribe código salvo la excepción de
abajo, y **tampoco lanza él mismo el agente de revisión** ni siquiera para
su propio código: pedirla (`requesting-code-review`) también se le encarga a
un worker.

**Excepción: el núcleo del módulo de dinero** (diseño de esquema,
migraciones, `repository.ts` de un módulo que toca montos) lo sigue
escribiendo el supervisor directamente, sin delegar — ver "Nunca
paralelizar sobre el módulo de dinero" abajo. Todo lo demás (`service.ts`,
`routes.ts`, frontend, tipos/clientes de API, pruebas fuera de ese núcleo)
va a un worker.

## Principio rector

**Simplicidad para el usuario.** Si una pantalla necesita explicación, está
mal diseñada. Entre lo potente y lo obvio, gana lo obvio.

## Fases

**El proyecto está al 100% cuando la app le sirve a su dueño para llevar sus
cuentas.** Alcance completo, no una versión recortada de algo más grande. Lo
de después son pasos opcionales que no se empiezan sin que el dueño lo pida
explícitamente.

### Hasta el 100%

| #   | Alcance                                    | Estado |
| --- | ------------------------------------------ | ------ |
| 0   | Esquema multi-tenant + migraciones         | hecha  |
| 1   | CRUD de movimientos, categorías, dashboard | hecha  |
| 2   | Autenticación y despliegue                 | hecha  |
| 3   | Uso real y ajustes de diseño               | activa |

### Bitácora (Fase 3)

Se trabaja directo sobre el código con `impeccable` (sin ronda de mockups) y
en features de negocio pedidas por el dueño sobre la marcha. Historial
completo de critiques en `.impeccable/critique/`; resumen de lo relevante:

- Tres rondas de `impeccable critique` (27/40 → 25/40 → 29/40) ya resueltas
  y en `main`: color semántico, detalle de movimiento, layout de escritorio,
  historial con filtros, transferencias entre cuentas propias, gráfica de
  tendencia en oscuro, entrar/registrarse con recuperación de contraseña.
  Los P1 de auth se probaron en producción con correo real.
- **Cuentas agrupadas por moneda + selector de moneda como filtro visible +
  ahorro simple** (marcar una cuenta como "de ahorro", total ahorrado y
  gráfica mensual en el Resumen) — en `main`.
- **Editar cuentas y modelar tarjetas de crédito** (2026-09-21): nombre
  editable; tarjetas ya no pueden marcarse como ahorro (el ahorro en tarjeta
  no tiene sentido); cupo opcional y cuenta vinculada ("desde dónde se
  paga") para tarjetas, con disponible/usado calculado en el cliente, nunca
  guardado. Usar o pagar una tarjeta no necesitó movimientos nuevos: un
  gasto ya sube la deuda, una transferencia ya la baja. Reglas reforzadas a
  nivel de base de datos (checks + FK compuesta), no solo en la app. En
  `main`.

Pendiente, sin fecha: otro `$impeccable critique` para medir el puntaje
actual.

### Pasos adicionales, ya pasado el 100%

Congelados — que la fase anterior se vea terminada no es razón para
arrancarlos; hace falta que el dueño lo diga con todas las letras.

| #   | Alcance                                   | Por qué está afuera                                                                                                          |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 4   | Pruebas de punta a punta (Playwright)     | Las pruebas actuales cubren el dinero. Un navegador automatizado protege sobre todo de otras personas tocando el mismo código, y aquí no hay otras personas. |
| 5   | Apertura a usuarios reales                | Cambia el proyecto de cosa personal a servicio: soporte, privacidad, costos ajenos. Aquí vive también "entrar con Google" (con un solo dueño no ahorra nada). |
| 6   | Integraciones externas + workers y outbox | Qué tanta falta hacen se sabe usando la app, no suponiéndolo antes.                                                          |

El paso 5 está empezado a medias: existe `/admin` (lista de quién entra +
"ver como esa persona", con registro), porque el dueño lo pidió antes de
abrir la app. Lo que falta del paso 5 — términos, privacidad, soporte,
costos, registro abierto — sigue congelado.

El esquema es multi-tenant desde la Fase 0 aunque los usuarios de la Fase 5
quizá no lleguen nunca; ya está hecho y quitarlo costaría más que dejarlo.
El orden no es caprichoso: se despliega y se usa de verdad (2 y 3) antes de
construir nada más — CSV, workers y outbox vuelven solo si usar la app
demuestra que hacen falta.

## Protocolo de fase

Antes de escribir código en cualquier fase o integración, presentar y
esperar confirmación:

1. **Estimación** — tiempo total y desglose por tarea; qué es incierto y
   por qué.
2. **Paralelización** — cuántos subagentes y qué hace cada uno: 1 si las
   tareas están acopladas o tocan los mismos archivos; 2–3 para módulos
   independientes (backend/frontend/tests); 4+ solo si son verdaderamente
   aislados, justificándolo. **Nunca paralelizar sobre el módulo de
   dinero.**
3. **Modelo y esfuerzo** — Haiku: scaffolding/boilerplate/renombrados.
   Sonnet: desarrollo normal. Opus: esquema, lógica de dinero, arquitectura.
   Esfuerzo bajo/medio/alto según riesgo.
4. **Cuestionar el alcance** — si se puede recortar sin perder valor,
   decirlo antes de empezar.

## Stack

- **Backend:** Node + Fastify + Drizzle + Zod
- **Frontend:** Next.js (App Router) + TanStack Query + Tailwind/shadcn + Recharts
- **DB:** PostgreSQL (Neon)
- **Auth:** Neon Auth / Auth.js — no construir autenticación propia
- **Jobs:** worker en el mismo proceso; se separa cuando compita con las requests
- **Móvil:** PWA responsive. No hay app nativa.
- **Infra:** Vercel Hobby (pantallas y API) + Neon Free (base) = $0/mes, todo
  en la misma dirección (sin CORS entre dominios, sin sesión viajando entre
  servidores, sin cold start). Vercel Hobby es no comercial: al monetizar,
  migrar a Cloudflare Pages.

## Arquitectura

Monolito modular. Un deploy, módulos internos.

    src/modules/
    accounts/       bancos, tarjetas, efectivo
    transactions/    movimientos (núcleo) + exportación del historial
    categories/      catálogo + reglas automáticas
    profile/         nombre y preferencias de quien usa la app
    admin/           registro de quién entró a la cuenta de quién
    imports/         parseo, preview, confirmación
    reports/         dashboard y gráficas
    budgets/         límites por categoría
    integrations/    conectores externos y webhooks

Tres capas por módulo: `routes.ts` (HTTP, valida con Zod, responde),
`service.ts` (lógica de negocio, no conoce HTTP), `repository.ts` (SQL, nada
más). **Regla:** un módulo nunca llama al repository de otro, solo al
service.

Sin microservicios, sin CQRS, sin event sourcing. **Patrones:** Repository ·
Service layer · Strategy (proveedores externos) · Outbox (eventos a tabla en
la misma transacción, worker los procesa después).

## Reglas no negociables

**Dinero**

- `NUMERIC(19,4)`, nunca float
- Movimientos inmutables: se corrige creando otro, jamás con `UPDATE`
- Los saldos (y cualquier derivado, como cupo disponible) se calculan;
  nunca se almacenan

**Multi-tenancy**

- `user_id` en toda tabla del núcleo, obligatorio en cada método del
  repository, nunca implícito
- **Ni siquiera un administrador lee los datos de otro con una consulta
  especial.** Para ver las cuentas de alguien, se convierte en esa persona
  (`/admin` → "Entrar") y usa la app tal cual, así toda consulta sigue
  pidiendo su `user_id`. Un agregado del sistema se piensa dos veces antes
  de abrir esa puerta.
- Suplantar no da acceso al panel (`esAdmin` vale `false` durante la
  suplantación) — si no, se podría saltar de una cuenta a otra sin rastro.
- **Desde la cuenta de otra persona solo se mira.** Todo método que escriba
  (`POST`/`PATCH`/`PUT`/`DELETE`) responde 403 mientras la sesión esté
  suplantada, cortado por método (no ruta por ruta) para que una ruta nueva
  nazca protegida. Lo que queda cerrado es la API de Cuadre; `/api/auth/*`
  tiene su propia puerta. Razón: el libro de movimientos no se edita, así
  que un gasto mal registrado queda escrito para siempre — se evita
  haciéndolo imposible, no con cuidado.

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
- **Integración BD:** cada tanda trabaja sobre una rama efímera de Neon,
  creada al empezar y borrada al terminar — mismo Postgres exacto que
  producción, sin depender de Docker.

Cobertura alta en dinero e integraciones, laxa en handlers y UI. No
perseguir un porcentaje global.

## Convenciones

- SQL visible vía Drizzle; sin abstracciones que lo escondan
- Validación con Zod en el borde
- Migraciones versionadas; nunca modificar una ya aplicada
- La misma imagen Docker en local y producción; solo cambian las env vars
- `docker compose up` levanta todo, migraciones incluidas
- Backup: `pg_dump` semanal fuera de la plataforma
