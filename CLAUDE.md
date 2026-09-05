# Cuadre

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
