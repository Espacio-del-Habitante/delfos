# Changelog

Todos los cambios notables de Delfos se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el versionado [SemVer](https://semver.org/lang/es/).

## [1.3.1] — 2026-07-30

### Añadido
- Instalador NSIS: pregunta si preparar dictado local (Whisper); al primer arranque descarga el modelo.
- Build de escritorio incluye el grupo `stt` (`faster-whisper`) en el binario PyInstaller.

### Cambiado
- Scrollbars globales más minimalistas: thumb fino, sin flechas ni track de Windows; integrado en toda la app.
- Mensajes de Whisper en app empaquetada ya no piden `uv sync` (comando solo de desarrollo).

## [1.3.0] — 2026-07-30

### Añadido
- Chat: consultas factuales de metas y cuentas (`finance_query` domains `goals` / `accounts`) además de portafolio.
- Context pack del asistente con progreso de meta (`current_amount`, remaining, cuentas enlazadas) y saldos/rol de cuentas.
- Titlebar Electron: control de arrastre a la izquierda (espejo del cerrar).

## [1.2.0] — 2026-07-30

### Añadido
- Frecuencia de pago en el perfil: mensual, quincenal o semanal (weekday).
- Recordatorio de payday y prefill de ingreso según el periodo (÷1 / ÷2 / ÷4).
- Propuesta de distribución con ingreso completo o parcial del periodo.
- Desglose opcional de gastos fijos en la allocation (sin quitar el total).
- Colchón: copy clara y opción de bloquear creando/transfiriendo a cuenta Colchón.
- Paginación y filtros de fecha en movimientos (`GET /api/movements`).
- Fixture QA (`seed_qa_fixture.py`) y checklist en `docs/qa_checklist.md`.
- Stepper unificado (`.delfos-stepper`) en onboarding y modal de ingreso.

### Cambiado
- Isla sticky con KPIs (ahorro, emergencia, cartera); sin navegación; estado de IA cloud/local.
- Wizard de perfil más guiado (consejo fuera del card, tip orgánico, sin pasteles).
- KPI de ahorro/mes alineado a zona horaria de negocio (Bogotá UTC−5).
- Modal de ingreso en un solo flujo con pasos Datos → Distribuir → Propuesta.

### Corregido
- Filtros de fecha que solo veían el top-12 de movimientos.
- Warning de fijos insuficientes al registrar un ingreso parcial como “completo”.

## [1.1.1] — 2026-07-26

### Añadido
- Isotipo, micrófono en Electron, backup/restore, branding.

## [1.1.0] — 2026-07-25

### Añadido
- Empaquetado Windows (Electron + backend embebido).

## [1.0.0] — 2026-07-25

### Añadido
- Primera versión pública de Delfos.

[1.3.1]: https://github.com/Espacio-del-Habitante/delfos/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/Espacio-del-Habitante/delfos/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Espacio-del-Habitante/delfos/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/Espacio-del-Habitante/delfos/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/Espacio-del-Habitante/delfos/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Espacio-del-Habitante/delfos/releases/tag/v1.0.0
