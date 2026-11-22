# MercApp (Expo)

Lista de mercado nativa — hermana móvil de Delfos. Local-first, suma al toque, dictado por voz.

## Stack

- Expo SDK 58 + React Native
- AsyncStorage (`demeter_mercado_v1`)
- `expo-speech-recognition` (mic nativo; en web depende del navegador)

## Correr

```bash
cd demeter
npm start          # Expo Go (QR)
npm run web        # preview web
npm run ios        # simulador (macOS)
npm run android
```

En el teléfono: Expo Go → escanear QR. El dictado pide permiso de micrófono.

## Flujo

1. Empezar mercado
2. Escribe `papa 8 mil` o dicta → se suma al carrito
3. Toca un ítem para editar qty / unidad / precio
4. Cerrar mercado al terminar

La PWA en `../mercado` queda como referencia web; esta app es el camino nativo.
