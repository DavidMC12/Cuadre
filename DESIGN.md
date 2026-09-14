---
name: Cuadre
description: Que las cuentas cuadren.
colors:
  paper: 'oklch(1 0 0)'
  ink: 'oklch(0.145 0 0)'
  ink-strong: 'oklch(0.205 0 0)'
  mist: 'oklch(0.97 0 0)'
  graphite: 'oklch(0.556 0 0)'
  hairline: 'oklch(0.922 0 0)'
  focus-gray: 'oklch(0.5 0 0)'
  money-in: '#059669'
  money-out: 'oklch(0.145 0 0)'
  destructive: 'oklch(0.577 0.245 27.325)'
  uncategorized-gray: '#898781'
typography:
  headline:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.25rem'
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: '0.025em'
  figure:
    fontFamily: 'Geist Mono, ui-monospace, monospace'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: 'tnum'
  figure-hero:
    fontFamily: 'Geist Mono, ui-monospace, monospace'
    fontSize: '1.5rem'
    fontWeight: 400
    lineHeight: 1.33
    fontFeature: 'tnum'
rounded:
  sm: '6px'
  md: '8px'
  lg: '10px'
  xl: '14px'
  pill: '26px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '20px'
  page-mobile: '16px'
  page-desktop: '32px'
components:
  button-primary:
    backgroundColor: '{colors.ink-strong}'
    textColor: '{colors.paper}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
  button-outline:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
  button-ghost:
    textColor: '{colors.ink}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
  input:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.lg}'
    padding: '4px 10px'
    height: '32px'
  card:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.xl}'
    padding: '16px'
  card-compact:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.xl}'
    padding: '12px'
  badge:
    backgroundColor: '{colors.ink-strong}'
    textColor: '{colors.paper}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    height: '20px'
  toggle-outline-selected:
    backgroundColor: '{colors.mist}'
    textColor: '{colors.ink}'
    rounded: '{rounded.lg}'
    height: '36px'
---

# Design System: Cuadre

## Overview

**Creative North Star: "El punto de partida"**

Lo que hay hoy no es una identidad elegida: es el tema por defecto de shadcn (estilo `base-nova`, base de color `neutral`) con la tipografía Geist, sobre el que se construyó la app entera. Se registra tal cual, sin atribuirle intenciones que no tuvo. La decisión tomada es **refinar**, no reemplazar: este documento es la base que el trabajo de diseño debe respetar y pulir.

Aun heredado, el sistema ya dice algo coherente con el producto. Es sobrio, casi todo en escala de grises, y el color aparece donde significa algo: la plata. Las cifras van en monoespaciada con dígitos tabulares, como en un libro de contabilidad, para que los montos se alineen y se comparen de un vistazo. La densidad es la de una app de uso diario en el celular: textos de 14px, controles de 32px de alto y tarjetas con bordes suaves.

Una decisión ya tomada, no heredada: un gasto no es una alarma. Antes, el monto de un gasto salía en rojo —el mismo rojo de un error o de "Cerrar sesión"—, y hasta un saldo en cero se pintaba de verde por accidente. Se comparó en mockups contra la alternativa (mantener el rojo) y se eligió el tono neutro: **un gasto resta en tinta normal, con el signo "−" explícito**, como cualquier otro renglón del libro. El rojo queda libre para lo que de verdad lo necesita: un error, una sesión que cierra, una acción que no se puede deshacer.

Pensado primero para el celular, en escritorio se abre un menú lateral y el contenido crece con tope. Hay tema claro y oscuro, que siguen al sistema por defecto.

**Key Characteristics:**

- Escala de grises como base; el color está reservado para el significado.
- Cifras en Geist Mono con dígitos tabulares, siempre completas y con su signo.
- Superficies planas separadas por un hilo de borde, sin sombras.
- Bordes curvos suaves y consistentes (10px en controles, 14px en tarjetas).
- Tema claro y oscuro con la misma estructura.

## Colors

Una paleta casi monocromática donde los únicos colores con saturación cuentan plata.

Los grupos siguen Primary/Secondary/Tertiary/Neutral, y a propósito se agregan dos más: "Semantic: money" y "Categorical (charts)" no encajan en esos cuatro roles y merecían su propio espacio en vez de forzarlos dentro de Neutral. Los valores en `oklch` son variables CSS reales de `globals.css`; los que están en hex vienen de clases de Tailwind o de constantes en TypeScript (`chart-colors.ts`, `monto.tsx`) que nunca pasaron por una variable CSS. La mezcla no es un descuido: es de dónde sale cada uno.

### Primary

- **Tinta Grafito** (`oklch(0.205 0 0)`, token `ink-strong`): relleno del botón principal y de las insignias. No es un color de marca; es el negro casi puro del tema neutral.

### Neutral

- **Papel** (`oklch(1 0 0)`, token `paper`): fondo de la página, de las tarjetas y de los campos.
- **Tinta** (`oklch(0.145 0 0)`, token `ink`): texto principal.
- **Niebla** (`oklch(0.97 0 0)`, token `mist`): fondo de lo seleccionado o en hover (opciones de alternar, menú activo, botones fantasma).
- **Grafito Suave** (`oklch(0.556 0 0)`, token `graphite`): texto secundario, etiquetas de sección, ayudas bajo un ajuste y fechas.
- **Hilo** (`oklch(0.922 0 0)`, token `hairline`): bordes de campos y divisiones entre filas de una lista.
- **Gris de Foco** (`oklch(0.5 0 0)`, token `focus-gray`): el anillo de foco del teclado. Se oscureció desde el `oklch(0.708 0 0)` original del tema de shadcn: medido con la fórmula de contraste de WCAG, el original al 50% de opacidad sobre blanco (así lo usan los controles) daba **1,54:1**; este valor sube a **2,14:1**, una mejora real pero que **todavía no alcanza el mínimo de 3:1** recomendado para indicadores de foco. Cerrarlo del todo pide subir también la opacidad con la que los controles usan este color (`ring-*/50` → algo más alto), un cambio que toca muchos componentes a la vez y por eso queda para una pasada de `$impeccable audit`, no para este ajuste puntual.

### Semantic: money

- **Verde Entrada** (`#059669`, token `money-in`; `#34d399` en oscuro): montos positivos y la barra de ingresos en la tendencia.
- **Tinta de Salida** (`oklch(0.145 0 0)`, token `money-out`; el mismo `ink`/`foreground` del texto normal, también en oscuro): montos negativos y la barra de gastos. Un gasto se lee, no alarma.
- **Rojo** (`oklch(0.577 0.245 27.325)`, token `destructive`; `oklch(0.704 0.191 22.216)` en oscuro): reservado para errores, "Cerrar sesión" y el aviso de suplantación — lo que de verdad es una alarma o no se puede deshacer. Ya no se usa para un gasto normal.
- **Gris Sin Categoría** (`#898781`, token `uncategorized-gray`): el balde "Sin categoría" en las gráficas.

### Categorical (charts)

Paleta fija de 8 tonos para categorías, validada para que tonos vecinos se distingan con daltonismo. Se asignan por orden alfabético del catálogo, así una categoría conserva su color de un mes a otro. De la novena en adelante comparten el gris neutro. Valores en `web/src/lib/chart-colors.ts`.

### Named Rules

**The Only Income Is Colored Rule.** Fuera de las gráficas, el único color saturado en pantalla es el verde de un ingreso. Un gasto resta en tinta normal, con signo. El resto es gris.

**The Red Is Reserved Rule.** El rojo no se gasta en algo tan cotidiano como un movimiento. Se guarda para un error, cerrar sesión, o algo que de verdad no se puede deshacer.

**The Fixed Palette Rule.** Las categorías nunca generan un tono nuevo: ocho colores fijos y luego gris.

## Typography

**Body Font:** Geist (con `ui-sans-serif, system-ui, sans-serif`)
**Label/Mono Font:** Geist Mono (con `ui-monospace, monospace`), solo para cifras

**Character:** Una sans geométrica y neutra para todo lo que se lee, más su hermana monoespaciada para todo lo que se cuenta. No hay una fuente de títulos distinta: `font-heading` apunta a la misma Geist.

### Hierarchy

- **Headline** (600, 1.25rem): el título de cada pantalla ("Resumen", "Movimientos").
- **Title** (500, 1rem): títulos de tarjeta.
- **Body** (400, 0.875rem): casi todo el texto, incluidas las filas de las listas y los botones (500).
- **Label** (500, 0.75rem, letter-spacing 0.025em, MAYÚSCULAS): encabezados de sección ("TU CUENTA", "GASTOS", "HOY").
- **Figure** (400, 1rem, tabular): montos en listas y tarjetas pequeñas; los decimales van al 85% de tamaño y con menos opacidad.
- **Figure Hero** (400, 1.5rem, tabular): el balance del mes.

### Named Rules

**The Counted In Mono Rule.** Toda cifra de dinero va en Geist Mono con dígitos tabulares; ningún texto que no sea una cifra la usa.

## Layout

Móvil primero, con una sola columna de 448px de ancho máximo y márgenes laterales de 16px. Hay encabezado fijo arriba y menú de cuatro pestañas fijo abajo, respetando el área segura del dispositivo; el contenido deja 96px libres al final para no quedar debajo del menú.

Desde **768px** (`md`) el menú pasa a una barra lateral fija de 224px (240px desde 1024px) y el encabezado móvil desaparece. El contenido crece a 672px, y a 768px desde **1024px** (`lg`), con márgenes de 32px. Tiene tope a propósito: las listas pierden legibilidad si se estiran.

El ritmo vertical entre bloques de una pantalla es de 16 a 20px. Las filas de lista separan con un hilo de borde, no con espacio. Las columnas aparecen solo donde el contenido lo aguanta: categorías en dos desde `md`, y resumen (tres tarjetas) y cuentas (dos) desde `lg`, para que ningún monto se corte.

Los formularios abren como cajón inferior; en escritorio quedan centrados con un máximo de 512px.

## Elevation & Depth

Plano. No hay sombras en superficies de reposo. La profundidad se marca con un anillo de 1px al 10% de la tinta alrededor de las tarjetas y con cambios de tono de fondo (Niebla) en lo seleccionado. Lo único que se superpone son los cajones y diálogos, con un velo detrás, y el encabezado fijo, con un leve desenfoque del fondo.

### Named Rules

**The Flat Ledger Rule.** Las superficies no flotan: se separan con un hilo o con un cambio de tono, nunca con sombra.

## Shapes

Esquinas suaves y uniformes derivadas de un radio base de 10px: controles, campos y opciones a 10px; tarjetas a 14px; insignias como píldora. Los iconos son de trazo (Lucide), y en el menú el trazo se engruesa de 2 a 2.5 para marcar la sección activa.

## Components

### Buttons

Discretos y compactos, de uso diario.

- **Shape:** esquinas suaves (10px), 32px de alto; hay variantes de 28px y 24px para acciones secundarias dentro de filas.
- **Primary:** fondo Tinta Grafito con texto Papel. Se usa para la acción principal de una pantalla ("Nuevo", "Registrar", "Guardar").
- **Outline:** fondo Papel con hilo de borde. Se usa para acciones de peso medio ("Descargar mis movimientos", "Cerrar sesión" con texto en Rojo Salida).
- **Ghost:** sin fondo, y Niebla al pasar el cursor. Se usa para acciones dentro de filas ("Anular", "Archivar").
- **Hover / Focus:** el primario baja al 80%; el foco muestra un anillo de 3px en Gris de Foco al 50%; al presionar baja 1px.

### Chips

- **Style:** insignias de 20px en píldora. La variante de contorno marca el tipo de movimiento ("Saldo inicial", "Anulado"); la sólida marca "admin" en el panel.

### Cards / Containers

- **Corner Style:** 14px.
- **Background:** Papel.
- **Shadow Strategy:** ninguna; anillo de 1px (ver Elevation & Depth).
- **Border:** anillo de tinta al 10%.
- **Internal Padding:** 16px; 12px en la variante compacta de las cifras del resumen.

Las secciones de Ajustes usan un contenedor con borde y filas divididas por hilo, con título en Label por encima.

### Inputs / Fields

- **Style:** hilo de borde, fondo Papel, esquinas de 10px y 32px de alto; texto de 16px en celular, para que el navegador no haga zoom, y de 14px desde `md`.
- **Focus:** borde en Gris de Foco con anillo de 3px al 50%.
- **Error / Disabled:** borde y anillo en Rojo; los deshabilitados van al 50% de opacidad.

### Navigation

- **Mobile:** barra inferior fija de 64px con cuatro pestañas iguales (icono de 20px sobre etiqueta de 12px). La activa usa texto Tinta e icono con trazo más grueso; las demás van en Grafito Suave.
- **Desktop:** barra lateral con el nombre "Cuadre" arriba (18px, 600 — un tamaño propio, entre Headline y Title, que no comparte con ningún otro texto de la app) y las mismas cuatro entradas en fila, con etiqueta en Body (14px, 500) e icono de 18px. La activa lleva fondo Niebla y esquinas de 10px. "Ajustes" también se marca en Categorías y en Administración.

### Monto (signature)

El componente que más define la app. Muestra la cifra completa en Geist Mono tabular, con símbolo de moneda. Va en Verde Entrada si es positiva, en Tinta de Salida (normal, no roja) con el signo "−" explícito si es negativa, y en Grafito Suave sin ningún signo si es cero. Los decimales se ven más pequeños y tenues para que el entero mande, y en los saldos puede mostrar solo el signo negativo.

### Aviso de suplantación (signature)

Una franja fija de ancho completo en Rojo con texto blanco, arriba de todo: "Mirando la cuenta de …" más un botón "Volver". No se puede cerrar. Es la única superficie grande de color de toda la app — y la única que sí necesita alarmar.

## Do's and Don'ts

### Do:

- **Do** mostrar cada monto completo, con signo y símbolo, en Geist Mono tabular (componente `Monto`).
- **Do** dejar el gasto en tinta normal con signo "−"; el rojo se reserva para errores y acciones que de verdad no se pueden deshacer.
- **Do** separar filas y superficies con un hilo de 1px o un cambio de tono, no con sombras.
- **Do** mantener las esquinas en la escala de 10px (controles) y 14px (tarjetas).
- **Do** diseñar cada cambio en celular y escritorio a la vez, respetando los tramos de 768px y 1024px.

### Don't:

- **Don't** abreviar ni redondear cifras ("1,2 M", "$1k"): el producto se compromete a montos exactos.
- **Don't** teñir un gasto de rojo, ni un cero de verde o de rojo: un cero no es ni lo uno ni lo otro.
- **Don't** generar colores nuevos para categorías; ocho fijos y luego gris.
- **Don't** usar la monoespaciada para texto que no sea una cifra.
- **Don't** estirar listas a todo el ancho en escritorio; el contenido tiene tope.
- **Don't** confundir este punto de partida con una identidad terminada: se refina, pero sus valores por defecto no son decisiones sagradas.
