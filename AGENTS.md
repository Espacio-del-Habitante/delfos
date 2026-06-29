# Delfos Codex Context

Responde siempre en espanol. Conserva nombres tecnicos en ingles cuando sea mas claro.

Antes de escribir codigo, lee `docs/00_vision.md` y `docs/01_arquitectura.md`. Esos documentos son la fuente de verdad del producto y la arquitectura.

Implementa la arquitectura definida en esos documentos. No la redisenes ni la reinventes. Si una tarea exige cambiar la estructura de carpetas o la arquitectura, detente y pregunta.

## Backend

Respeta las capas de Flask en `backend/`:

- `app.py`: API y wiring HTTP.
- `services/`: logica de negocio y persistencia JSON.
- `integrations/`: proveedores IA via registry y adapters.

No saltes capas. Reutiliza servicios, helpers y patrones existentes antes de crear codigo nuevo.

## Frontend

Respeta el frontend Astro/Svelte en `frontend/`:

- Organizacion feature-based en `features/`.
- Atomic design en `common/`.
- Cliente HTTP en `lib/api.ts`.
- Estado en `stores/`.

Manten los cambios cerca de la feature o componente afectado.

## Modo Ponytail

Trabaja como senior pragmatico y eficiente: el mejor codigo es el codigo que no hay que escribir.

Antes de implementar, sube esta escalera y detente en el primer nivel que resuelve el problema:

1. Confirma si realmente necesita construirse.
2. Busca si ya existe en el codebase.
3. Usa la standard library si aplica.
4. Usa una feature nativa de la plataforma si cubre el caso.
5. Usa una dependencia ya instalada si evita codigo propio.
6. Hazlo en la forma mas pequena que siga siendo correcta.

Reglas:

- No agregues abstracciones no solicitadas.
- No agregues dependencias nuevas si puede evitarse.
- Prefiere borrar o simplificar antes que sumar capas.
- Para bugs, busca la causa raiz y revisa todos los callers del codigo que tocas.
- Valida input en boundaries de confianza.
- No sacrifiques seguridad, accesibilidad, manejo de errores ni prevencion de perdida de datos.
- Si haces una simplificacion intencional con techo conocido, marca `ponytail:` y explica el techo y el upgrade path.
- Logica no trivial debe dejar un check runnable pequeno: test, assert/demo o comando minimo que fallaria si se rompe.

## Skills Portadas Desde Cursor

La configuracion equivalente a `.cursor/skills` vive en `.codex/skills/`:

- `emil-design-eng`: usar para construir o revisar UI, interacciones, microinteracciones y polish visual.
- `review-animations`: usar para reviews especificas de motion/animation.

Cuando una tarea active esas areas, carga el skill correspondiente antes de editar o revisar.
