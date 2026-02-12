# ArbetsYtan Mobilapp (Expo)

Detta är mobilappen för ArbetsYtan, byggd med Expo SDK 54.

## Utveckling

### Förutsättningar
- Node.js 20+
- EAS CLI: `npm install -g eas-cli`

### Starta utvecklingsserver
```bash
npm install
npx expo start
```

## Build-instruktioner

Vi använder EAS (Expo Application Services) för att hantera builds och distribution.

### 1. Lokal Development Build (Simulator/Emulator)
För att testa native moduler och push-notiser krävs en development build (inte Expo Go).

**Android (APK):**
```bash
eas build --profile development --platform android --local
```

**iOS (Simulator):**
(Kräver macOS)
```bash
eas build --profile development --platform ios --local
```

### 2. EAS Cloud Build (Rekommenderat)
Körs på Expos servrar (kräver inloggning med `eas login`).

**Internal Preview (Internal Distribution):**
```bash
eas build --profile preview --platform all
```

**Production (App Store/Google Play):**
```bash
eas build --profile production --platform all
```

## Distribution

### Testflight (iOS)
1. Skapa en production build: `eas build --profile production --platform ios`
2. Skicka till App Store Connect: `eas submit --platform ios`

### Google Play Console (Android)
1. Skapa en production build: `eas build --profile production --platform android`
2. Skicka till Google Play: `eas submit --platform android`

## Push-notifikationer
Push-notifikationer kräver en Development Build eller Production Build. De fungerar **INTE** i Expo Go på Android.

## Tekniska krav
- **Expo SDK:** 54
- **React Native:** 0.81
- **New Architecture:** Aktiverad (`newArchEnabled: true` i `app.json`)
- **Icons:** Alla ikoner i `assets/` ska vara kvadratiska (1024x1024).
