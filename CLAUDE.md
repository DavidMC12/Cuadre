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
- **Cuarta ronda de `impeccable critique`** (2026-09-28, 25/40 → 27/40, sin
  P0): los dos P1 ya resueltos y en `main`. Un tope de gasto excedido ya no
  se marca "cumplido" en verde (queda para metas de ahorro); ahora avisa en
  rojo cuánto te pasaste. Resumen, Movimientos y el panel de presupuesto ya
  no confunden un fallo de red con "no tienes nada" — aparece un mensaje de
  error con Reintentar (`FalloConsulta`), y un refetch fallido con datos ya
  en pantalla no los borra.
- **Casa propia del checklist + `FalloConsulta` extendido** (2026-09-28):
  entrada "Presupuesto" en el menú (página con mes y moneda, `panel` en
  variante suelta para no anidar contenedores); el aside oculto del Resumen
  se monta solo cuando la pantalla es xl. El bloque `FalloConsulta` es ya la
  única fuente del patrón: Ajustes migrado, gráficas del Resumen y los
  ítems archivados del panel avisan con Reintentar, y un fallo de conexión
  usa el mensaje exacto del cliente HTTP.
- **Una sola gramática de guardado en el cajón de cuenta + detalles P3**
  (2026-09-28): nombre y cupo ya guardan al salir del campo o con Enter,
  igual que la cuenta vinculada y el switch de ahorro (antes mezclaban
  botón, guardado automático y descarte silencioso); avisa siempre si hay
  texto sin guardar al cerrar. El saldo de una tarjeta se etiqueta según su
  signo real (ya no dice "Debes" si está sobrepagada), la barra de cupo
  avisa en ámbar antes del límite, el FAB perdió la sombra y los toggles de
  Gasto/Ingreso y Tipo/Moneda suben a 44px. Con esto quedan resueltos todos
  los P1/P2/P3 de la cuarta ronda de critique; quedan solo detalles
  menores anotados en esas dos ramas (extraer `SelectorMoneda` si una
  tercera pantalla lo repite, mes en la URL de `/presupuesto`).
- **Cuentas agrupadas por moneda + selector de moneda como filtro visible +
  ahorro simple** (marcar una cuenta como "de ahorro", total ahorrado y
  gráfica mensual en el Resumen) — en `main`.
- **Checklist de presupuesto** (2026-09-16): módulo `budgets/` completo
  (esquema, servicio, rutas y pruebas de punta a punta) con su panel en el
  Resumen; renglones por mes con objetivo, progreso y opción de archivar. En
  `main`; ya pasó por la cuarta ronda de `impeccable critique` (arriba).
- **Editar cuentas y modelar tarjetas de crédito** (2026-09-21): nombre
  editable; tarjetas ya no pueden marcarse como ahorro (el ahorro en tarjeta
  no tiene sentido); cupo opcional y cuenta vinculada ("desde dónde se
  paga") para tarjetas, con disponible/usado calculado en el cliente, nunca
  guardado. Usar o pagar una tarjeta no necesitó movimientos nuevos: un
  gasto ya sube la deuda, una transferencia ya la baja. Reglas reforzadas a
  nivel de base de datos (checks + FK compuesta), no solo en la app. En
  `main`.

- **Quinta ronda de `impeccable critique`** (2026-09-29, 27/40 → 31/40,
  "Bueno", sin P0): confirmó que los cuatro arreglos del día anterior
  aterrizaron de fondo, no fue maquillaje. Hallazgos resueltos en `main`:
  Cuentas y Categorías eran las dos únicas pantallas sin el patrón
  `FalloConsulta` (un fallo de red se veía como cuerpo en blanco o como
  "Todavía no tienes categorías"); las gráficas de tendencia y ahorro no
  tenían nombre accesible (ahora `role="img"` + tabla `sr-only` +
  `accessibilityLayer={false}` para que el SVG decorativo no quede
  enfocable); corregir un movimiento costaba anular y reescribir todo a
  mano (ahora "Sí, anular" abre el formulario precargado con los mismos
  datos); la barra de navegación de 5 pestañas recortaba etiquetas a
  320px (`flex-1` → `grow`); y la deriva P3 (una cifra de dinero en
  flotante en "Otras categorías", el botón "Close" en inglés, toggles de
  28/32px) quedó pareja con el resto de la app en 44px. Ajustes y el
  panel de administración también adoptaron la política de datos
  obsoletos. El último toggle bajo 44px (`formulario-categoria.tsx`) se
  cerró aparte, sin P0/P1/P2/P3 abiertos de esta ronda.

- **Sexta ronda de `impeccable critique`** (2026-09-29, 31/40 → 34/40,
  "Bueno", sin P0): confirmó que 4 de los 5 arreglos de la quinta ronda
  aterrizaron de fondo (el de gráficas quedó 2 de 3: la de categoría
  nunca necesitó el arreglo de accesibilidad). Encontró un P1 nuevo, ya
  resuelto en `main`: al corregir un movimiento, la cabecera "Corregir
  movimiento" / "el original ya quedó anulado" era invisible (solo
  `sr-only`), así que un reenvío sin cambios podía recrear en silencio
  la entrada recién anulada. Ahora la cabecera se ve en modo corrección
  y "Registrar" queda apagado (con aviso) hasta que cambie al menos un
  campo respecto a la precarga. Los dos P2 también resueltos: corregir
  un movimiento de una cuenta archivada ya conserva esa cuenta en el
  selector en vez de caer por fallback silencioso a otra (defensivo: el
  servidor ya bloquea anular en cuenta archivada); y `FalloConsulta`
  gana `compartePantalla`, que baja el bloque a `role="group"` cuando
  conviven varios fallos, así el Resumen compone un único
  `role="status"` en vez de disparar hasta seis anuncios a la vez. Los
  dos P3 también resueltos: todo el texto visible del presupuesto dice
  "Presupuesto" (antes convivía con "Checklist del mes"), y la barra de
  5 pestañas mantiene `grow` (el ancho por contenido que evitó el bug de
  `flex-1` a 320px) pero con un piso de toque de 44px físicos, no en
  `rem` — verificado con un script propio (`npm run medir:nav`, Chromium
  headless por CDP) a 320px con letra del sistema del 100% al 200%. Con
  esto quedan resueltos todos los P0/P1/P2/P3 de la sexta ronda.

- **Presupuesto por mes, con ingresos** (2026-10-01): la lista del
  presupuesto ya no crece sin fin (scroll interno) y se agrupa por categoría
  con el color de cada una, de la que más ítems tiene a la que menos. Cada
  ítem lleva su propio monto por mes, editable también en meses pasados
  ("Poner monto" cuando un mes no tiene), y el presupuesto admite categorías
  de ingreso (salario, variables) en secciones Ingresos y Gastos: recibir de
  más nunca se pinta como "te pasaste". Migraciones `0008` (quita el
  disparador que bloqueaba montos en meses pasados) y `0009` (el check de
  `budget_items` admite `category_kind = 'income'`): **aplicadas a la base de
  producción el 2026-10-04** (verificado: 10 migraciones, sin el disparador
  viejo, el check admite `income`). Las migraciones **no corren solas** en
  cada despliegue: se aplican a mano con `npm run db:migrate`. Fijar un monto sigue siendo solo-`INSERT`: el mes
  siguiente solo se ancla si ya empezó, así subir el tope de hoy rige hacia
  adelante. Deuda anotada: fijar un mes anterior a la creación del ítem hace
  que el siguiente herede; el formulario pierde lo tecleado si el monto
  guarda y la etiqueta falla; el año `0000` se valida en el service y no en
  `MesSchema`; no hay dedupe contra el monto heredado; `Idempotency-Key` no
  existe en el proyecto; `formulario-item-presupuesto.tsx` quedó con comillas
  simples; sin el disparador, la base ya no frena un monto con fecha pasada
  (posible reemplazo: check de rango).

- **"Cuánto me sobra este mes"** (2026-10-01): cuadrito en el Resumen.
  Previsto = ingresos presupuestados − gastos presupuestados (el ahorro NO
  entra, decisión del dueño); debajo, el real del mes (recibido − gastado).
  Se calcula en el cliente con enteros exactos, una moneda a la vez, nunca se
  guarda; el sentido va siempre en palabras ("Te sobran" / "Te faltan"). El
  texto del real depende del mes (Hasta hoy / En el mes; en un mes futuro no
  se muestra), un lado faltante del presupuesto no esconde el real, el error
  manda sobre el esqueleto y una consulta pausada sin red avisa en vez de
  quedar en blanco. La columna derecha del Resumen en xl scrollea sola (no
  deja el pie inalcanzable en laptops bajas; `npm run medir:aside`).
  *(Superado el 2026-10-04: el aside ya no scrollea; ver "Resumen sereno,
  scroll fino y el alternar de verdad".)*
  Aprendizaje: la sesión de worker2 se saturó y se estancó (inventó una
  rama); el relevo lo tomó worker1 y la revisión independiente atrapó dos
  fallos graves que sus pruebas no veían.

- **Columna del Resumen sin cortes + "Contraer todo"** (2026-10-04): el
  dueño vio, con capturas, el cuadro "Cuánto me sobra" y las categorías
  abiertas del presupuesto recortados. Causa: las tarjetas del aside xl eran
  hijas de un flex con `overflow-hidden`, así que se encogían en vez de
  desbordar y el aside nunca scrolleaba de verdad. Primer arreglo: `shrink-0`
  + scroll de toda la columna (SUPERADO por el rediseño de abajo: el dueño
  pidió scroll solo para la lista del presupuesto); el encabezado de cada
  categoría queda pegado al recorrerla y hay un botón "Contraer todo" (hoy
  alterna con "Desplegar todo"). Las clases viven en `web/src/lib/aside-resumen.ts`, que importan el
  componente y la medición con Chromium (`npm run medir:aside`) para que no
  mida un espejo desactualizado. No se hizo scroll por categoría a propósito
  (atrapa el dedo y el cursor).

- **El panel recuerda qué categorías quedaron abiertas y cerradas**
  (2026-10-04): el dueño lo pidió "tal cual". Se guarda en `localStorage`
  del navegador (clave `cuadre:presupuesto:grupos-cerrados:v1`), por ser
  una preferencia de pantalla y no dinero; igual en el Resumen (aside y
  cajón móvil) y en `/presupuesto`, en todos los meses y monedas. Un grupo
  nunca visto sale abierto. Almacén bloqueado, modo privado o JSON corrupto
  caen a "todo abierto" sin romper (el toggle sigue funcionando en memoria);
  `useSyncExternalStore` evita errores de hidratación y mantiene sincronizados
  dos paneles montados y las pestañas (evento `storage`). La poda de
  categorías borradas nunca corre mientras una consulta está en curso. No se
  sincroniza entre dispositivos y así se queda (decisión del dueño,
  2026-10-04): guardarlo en la cuenta exigiría backend y migración para una
  preferencia de pantalla, y el botón "Contraer/Desplegar todo" ya resuelve
  la molestia de repetirlo en otro aparato.

- **Deuda menor del presupuesto pagada** (2026-10-04): `MesSchema` vive
  una sola vez en `src/shared/schemas.ts` con rango sano (año 2000-2100):
  un mes como `0000-01`, `2026-13` o `1999-12` responde 400 (la convención
  de validación del borde) en reportes y presupuesto, en vez de 500 de
  Postgres; la regla la impone Zod en el borde, no la base. El formulario de
  ítem de presupuesto conserva TODO lo que la persona editó (monto,
  etiqueta, tipo, categoría, cuenta) cuando llega un refetch con el cajón
  abierto, y reinicia al cambiar de mes o de ítem. Comentario de
  `checked`/`exceeded` corregido para ingresos. Quedan anotados: el cliente
  no pone cota a la navegación de meses (1999-12 es inalcanzable en uso
  real), y un campo tocado y vuelto a su valor sigue "pendiente" hasta
  cerrar o guardar.

- **Resumen sereno, scroll fino y el alternar de verdad** (2026-10-04): el
  dueño corrigió la columna derecha sobre captura. (1) "Contraer todo" ya no
  desaparece: es un solo botón que alterna a "Desplegar todo" con todos los
  grupos cerrados (siempre visible mientras haya grupos; `expandirTodo` vacía
  lo guardado). (2) El aside xl ya NO scrollea; scrollea solo la lista del
  presupuesto dentro de su tarjeta, que se ajusta a la ventana
  (`max-h calc(100vh-2rem)` + `flex-1 min-h-0`), así el pie se alcanza sin
  scrollear la página. (3) El scroll de la columna comía ancho y recortaba el
  borde de la tarjeta y "Agregar": la lista reserva el carril
  (`scrollbar-gutter: stable`) y la barra es fina (`scroll-fino` en
  `globals.css`: 6px en Chromium, riel transparente, pulgar en
  `--muted-foreground`; en Firefox `scrollbar-width/color`). El encabezado a
  320px se rediseñó: título en su fila con "Agregar" (44px) a la derecha y el
  alternar en una fila discreta debajo; nada desborda en horizontal. (4)
  "Cuánto me sobra" salió de la columna derecha y vive sereno, a lo ancho de
  la columna principal, debajo de las tarjetas de balance y antes de las
  gráficas (una sola instancia para todos los anchos; en xl le cede al panel
  el anuncio del presupuesto). Medición Chromium (`npm run medir:aside`) y
  detector `impeccable detect --scope layout` sin hallazgos. Deuda anotada: un
  fallo SOLO del resumen del mes se anuncia dos veces (`ResumenCards` y "me
  sobra" consultan lo mismo); es previo a este cambio y no se tocó.

- **Séptima ronda de `impeccable critique`** (2026-10-04, 28/40, sin P0):
  la hicieron los workers (evaluación de diseño + detector, dos pasadas
  aisladas). Hueco: no hubo navegador real, porque falta `web/.env.local`
  con `NEON_AUTH_*` y Turbopack rechaza symlinks de `node_modules` en
  worktrees. Los dos P1 quedaron resueltos en `main`: (1) una consulta
  pausada sin datos ya no se disfraza de "no tienes nada" en ninguna
  pantalla (una sola política "Sin conexión", y la voz de los errores
  renovada, sin "servidor dormido"); (2) el piso de toque de 44px llegó a
  los controles que quedaban (Reintentar, flechas de mes, Movimientos,
  Admin, Categorías, Cuentas, selector de moneda, etc.). También entró la
  pista "(n) categorías cerradas" del presupuesto. No se hicieron, a
  elección del dueño o por quedar anotados: el signo del ahorro solo se
  distingue por color (`grafica-ahorro.tsx`), un fallo SOLO del resumen
  se anuncia dos veces, y quedan candidatos a 44px (ojo de contraseña,
  `SelectTrigger` de filtros, "Cargar más", "Más detalles").
  **Cerrados después, el mismo día** (dos ramas más, en `main`): el
  signo del ahorro ya se dice con palabras ("Ahorraste" / "Retiraste" /
  "Sin movimiento") en el tooltip y en la tabla `sr-only`; un fallo SOLO
  del resumen ya se anuncia una vez (`anunciaResumen={false}` en el
  cuadrito "me sobra"); y el ojo de contraseña, los filtros de Movimientos,
  "Cargar más" y "Más detalles" llegan a 44px. Quedan en 32px, anotados por
  el revisor: selectores de cuenta, Fecha/Descripción, "Registrar" y
  "Entendido" del formulario de movimiento, y los renglones de los menús
  (`ui/select.tsx`); hay un par de botones "Reintentar resumen" en
  distintos roles, previo.
  **Barrido final del piso de 44px** (mismo día, en `main`): formulario de
  movimiento (selectores, Fecha, Descripción, "Registrar", "Entendido",
  monto grande), renglones de los menús desplegables (`ui/select.tsx`),
  "Guardar" de cambiar categoría, cajones de cuenta/categoría/presupuesto,
  Ajustes, Auth, menú lateral y diálogos. El interruptor de ahorro NO
  engorda su píldora: solo estira su área táctil (`after:-inset-y-[13px]`).
  Sin tocar a propósito: los enlaces de fila de `grafica-por-categoria.tsx`
  (lista densa) y los enlaces de texto en línea; las flechas de scroll del
  popup de Select. Las pruebas anclan clases, no píxeles (jsdom no mide):
  pendiente mirar a 320px en un navegador real y la corrección del
  interruptor no pasó por segundo revisor.

- **Octava ronda de `impeccable critique`** (2026-10-05, 28/40 → 30/40,
  "Bueno", **sin P0 ni P1**): la hicieron los workers (A diseño en
  worker1, B detector y mediciones en worker2). Confirmó que los dos P1 de
  la séptima y los cierres del día anterior aterrizaron de fondo (44px,
  "Sin conexión", signo del ahorro, anuncio único); detector con 0
  hallazgos y `medir:nav/panel/aside` en verde con Chromium real. Sigue
  sin navegador real (falta `web/.env.local` con `NEON_AUTH_*`, Turbopack
  rechaza symlinks de `node_modules` en worktrees). Quedan 4 P2, sin
  atender: (1) en auth el error no pertenece a ningún campo
  (`aria-invalid`/`aria-describedby`); (2) en el ítem de presupuesto los
  Label no tienen `htmlFor`/id y `aria-invalid` se cruza con el error de
  monto; (3) suplantar entra a otra cuenta con un solo toque, sin
  confirmación (`admin/page.tsx`); (4) un fallo SOLO del resumen pinta dos
  bloques de error idénticos (el anuncio ya es uno, la pantalla no). Con
  los P2 de accesibilidad cerrados el estimado es 31–32. Reporte completo
  en `.impeccable/critique/2026-10-05T11-34-10Z__web-src.md`.

Pendiente, sin fecha: decidir si se atienden los 4 P2 de la octava ronda
y otra ronda de `impeccable critique` después para medir el puntaje.

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
