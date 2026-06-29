# Arquitectura del Proyecto

> Este documento define la arquitectura obligatoria del proyecto.
> Es la FUENTE DE VERDAD para cualquier implementación.
> Los agentes DEBEN leer este documento ANTES de escribir código.

---

## 1. Vista rápida

```
<diagrama de una línea, p. ej.:
Frontend  ↔  REST API  →  Services  →  Integrations + Store>
```

- <qué consume qué>
- **Regla de oro:** <la invariante principal, p. ej. dependencias hacia adentro / separación por servicios>

## 2. Principios arquitectónicos

| Principio | Descripción |
|-----------|-------------|
| <principio 1> | <qué impone> |
| <principio 2> | <qué impone> |

## 3. Capas y responsabilidades

### 3.1 <Capa A> (p. ej. API / routing)
<responsabilidad + archivos clave>

### 3.2 <Capa B> (p. ej. Services / lógica de negocio)
<responsabilidad + archivos clave>

### 3.3 <Capa C> (p. ej. Integrations / Infraestructura)
<responsabilidad + patrón usado, p. ej. adapter/registry>

## 4. Estructura de carpetas real

```
<árbol real del backend>
```

```
<árbol real del frontend>
```

## 5. Flujo de datos

<Cómo viaja una petición de lectura y una de escritura, paso a paso.>

## 6. Reglas clave para agentes

- <qué SÍ hacer: respetar tal capa, tal patrón>

## 7. Prohibiciones

| Prohibido | Razón |
|-----------|-------|
| <acción> | <por qué rompe la arquitectura> |
