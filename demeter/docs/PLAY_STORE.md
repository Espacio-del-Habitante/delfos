# MercApp — Checklist Play Store

Evaluación práctica (nov 2026). No es asesoría legal; valida en Play Console antes de publicar.

## Estado técnico actual

| Requisito | Estado | Nota |
|-----------|--------|------|
| Package id | ✅ | `app.delfos.demeter` |
| Icono adaptativo | ✅ | `app.json` android.adaptiveIcon |
| Firma AAB (upload key) | ⬜ | Crear keystore + `eas build -p android --profile production` |
| targetSdk | ⚠ | Subir a **API 35+** (desde ago 2026, nuevos/updates hacia API 36) |
| Privacy policy URL pública | ⬜ | Obligatoria en Play Console + link en la app |
| Data safety form | ⬜ | Declarar mic, fotos, keys BYOK, sync Delfos opcional |
| Contenido / screenshots | ⬜ | Teléfono + tablet si aplica; feature graphic |
| Cuenta Play Console ($25) | ⬜ | Pago único desarrollador |
| Políticas de permisos | ⚠ | Mic + (si hay) cámara: justificación en ficha y runtime |
| Sin keys embebidas en el APK | ✅* | BYOK del usuario; SecureStore. *Nunca pegues una key tuya en el binario* |
| Build de producción (no Expo Go) | ⬜ | Dev client / EAS; speech nativo no va en Expo Go |
| Clasificación de contenido | ⬜ | Cuestionario IARC en Console |
| Prueba cerrada previa | ⬜ | Recomendado: internal/closed testing track |

## Datos a declarar (Data safety) — borrador

MercApp es **local-first**. El usuario pega su propia API key.

| Dato | ¿Se recoge? | ¿Se comparte? | Notas |
|------|-------------|---------------|-------|
| API key del usuario | Se guarda **solo en el dispositivo** (Keystore) | No a tus servidores | Se envía al proveedor que el usuario eligió (Gemini / OpenRouter…) |
| Lista de mercado / montos | Local (AsyncStorage) | Solo si el usuario sync a **su** Delfos | No analytics de terceros hoy |
| Fotos de producto / factura | Local | No (salvo que el usuario use visión → proveedor IA) | Comprimidas; no suben a un backend MercApp |
| Audio / mic | En dispositivo → speech OS | No a MercApp | Permiso RECORD_AUDIO |
| Identificadores de publicidad | No | — | No hay AdMob hoy |

## Seguridad de API keys (política de producto)

1. **Nunca** meter una key de Delfos/Gemini del equipo dentro del APK.
2. BYOK: cada usuario usa la suya; cuota y ToS del proveedor son del usuario.
3. Persistencia: SecureStore; backups JSON **sin** key.
4. Gemini: header `x-goog-api-key` (no `?key=` en URL).
5. Si algún día hay key de servidor: solo en backend Delfos (como dice `docs/01_arquitectura.md`), nunca en el cliente.

## Camino mínimo a publicar

1. Cuenta Play Console + privacy policy publicada (URL https).
2. `eas.json` production + keystore; generar **AAB**.
3. Completar Data safety alineado a la tabla de arriba.
4. Internal testing → closed → production.
5. Preparar build nativo (mic/cámara no se validan bien solo con Expo Go).
