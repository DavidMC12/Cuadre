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
- Para que el perfil de GitHub del usuario se vea activo, se debe comitear seguido: cada vez que una parte pequeña y completa del trabajo esté lista (una función, una corrección, un ajuste), en vez de acumular varios cambios en un solo commit grande al final. No se deben crear commits vacíos o sin cambios reales solo para inflar el conteo.
- **Cada commit se sube (`push`) a su rama de inmediato**, en la misma acción, no al final de la sesión. Un commit que se queda en la máquina no existe para nadie más y no aparece en el perfil de GitHub. La primera vez en una rama nueva: `git push -u origin <rama>`; después, `git push` a secas. Si el push falla (por ejemplo, sin red), se avisa al usuario en vez de seguir acumulando commits en silencio.
- Esa regla de subir siempre aplica **solo a la rama propia**. `main` sigue intocable sin permiso explícito, según las dos condiciones de arriba.

## Principio rector

**Simplicidad para el usuario.** Si una pantalla necesita explicación, está
mal diseñada. Entre lo potente y lo obvio, gana lo obvio.

## Fases

| #   | Alcance                              |
| --- | ------------------------------------ |
| 0   | Esquema multi-tenant + migraciones   |
| 1   | CRUD de movimientos, auth, dashboard |
| 2   | Importación de extractos (CSV)       |
| 3   | Workers + patrón outbox              |
| 4   | Integraciones con APIs externas      |
| 5   | Apertura a usuarios reales           |

El esquema es multi-tenant desde la Fase 0, aunque los usuarios lleguen en la 5.

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
- **Infra:** Render Free + Neon Free + Vercel Hobby = $0/mes.
  Vercel Hobby es no comercial: al monetizar, migrar a Cloudflare Pages.

## Arquitectura

Monolito modular. Un deploy, módulos internos.

src/modules/
accounts/ bancos, tarjetas, efectivo
transactions/ movimientos (núcleo)
categories/ catálogo + reglas automáticas
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
| Integración BD        | Testcontainers              | F1    |
| Concurrencia          | Vitest                      | F1    |
| Componente            | Testing Library             | F2    |
| E2E                   | Playwright                  | F3    |
| Contrato              | MSW                         | F4    |

- **Consistencia:** el ledger cuadra contra los saldos calculados. En CI y
  como job diario en producción.
- **Concurrencia:** escrituras simultáneas sobre la misma cuenta sin perder
  actualizaciones.

Cobertura alta en dinero e integraciones, laxa en handlers y UI. No perseguir
un porcentaje global.

## Convenciones

- SQL visible vía Drizzle; sin abstracciones que lo escondan
- Validación con Zod en el borde
- Migraciones versionadas; nunca modificar una ya aplicada
- La misma imagen Docker en local y producción; solo cambian las env vars
- `docker compose up` levanta todo, migraciones incluidas
- Backup: `pg_dump` semanal fuera de la plataforma
