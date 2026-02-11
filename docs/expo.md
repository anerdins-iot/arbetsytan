---
title: Expo SDK 54
description: Komplett guide för Expo mobilappsutveckling med SDK 54, React Native 0.81, Expo Router v6 och EAS Build
tags: [expo, react-native, mobile, ios, android, eas]
---

## KRITISKT - Versioner och Breaking Changes

> ⚠️ **VIKTIGT:** Expo SDK 54 är senaste versionen med flera kritiska breaking changes. Följande är **FÖRÅLDRADE och ska ALDRIG användas**:

| Föråldrat | Korrekt (SDK 54) |
|-----------|------------------|
| `expo-av` | `expo-audio` + `expo-video` |
| `expo-background-fetch` | `expo-background-task` |
| `expo-file-system` (gamla API:t) | `expo-file-system` (nya) eller `/legacy` |
| JSC (JavaScriptCore) | Hermes (officiellt stöd) eller `@aspect-build/jsc` (community) |
| Legacy Architecture | New Architecture (default) |
| React Native `SafeAreaView` | `react-native-safe-area-context` |

```tsx
// ❌ ANVÄND ALDRIG - Dessa är deprecated i SDK 54
import { Audio, Video } from 'expo-av'
import * as BackgroundFetch from 'expo-background-fetch'
import { SafeAreaView } from 'react-native'

// ✅ KORREKT SDK 54-syntax
import { useAudioPlayer } from 'expo-audio'
import { useVideoPlayer, VideoView } from 'expo-video'
import * as BackgroundTask from 'expo-background-task'
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context'
```

---

## Versioner

| Paket | Version | Anmärkning |
|-------|---------|------------|
| Expo SDK | 54.0.31 | September 2025 |
| React Native | 0.81.4 | |
| React | 19.1.0 | |
| Expo Router | 6.0.21 | Native tabs, Liquid Glass |
| Node.js | 20.19.4+ | **Node 18 stöds EJ** |
| Xcode | 16.1+ | Xcode 26 för iOS 26-features |

> ⚠️ **SDK 54 är SISTA versionen med Legacy Architecture-stöd.** Migrera till New Architecture nu.

---

## Installation och Setup

### Skapa nytt projekt

```bash
# Skapa projekt med default template (TypeScript + Expo Router)
npx create-expo-app@latest MyApp

# Starta utvecklingsserver
cd MyApp
npx expo start
```

### Uppgradera befintligt projekt

```bash
# Uppgradera till SDK 54
npx expo install expo@^54.0.0

# Fixa dependencies automatiskt
npx expo install --fix

# Kör doctor för att hitta problem
npx expo-doctor
```

### Projektstruktur

```
my-app/
├── app/                    # Expo Router (filbaserad routing)
│   ├── _layout.tsx         # Root layout
│   ├── index.tsx           # / (hem)
│   ├── (tabs)/             # Tab-grupp (route group)
│   │   ├── _layout.tsx     # Tabs layout
│   │   ├── home.tsx        # /home
│   │   └── profile.tsx     # /profile
│   ├── [id].tsx            # Dynamisk route /:id
│   └── +not-found.tsx      # 404-sida
├── components/
├── assets/
├── app.json                # Expo config
├── eas.json                # EAS Build config
└── package.json
```

---

## Development Builds vs Expo Go

> ⚠️ **VIKTIGT:** Expo Go är endast för prototyper. Production-appar kräver Development Builds.

| Feature | Expo Go | Development Build |
|---------|---------|-------------------|
| Push notifications (Android) | ❌ Ej SDK 53+ | ✅ |
| Native modules | ❌ Begränsat | ✅ Alla |
| Config plugins | ❌ | ✅ |
| Custom native kod | ❌ | ✅ |
| Production-redo | ❌ | ✅ |

### Skapa Development Build

```bash
# Installera dev-client
npx expo install expo-dev-client

# Bygg lokalt
npx expo run:ios
npx expo run:android

# Eller via EAS Build (rekommenderat)
eas build --profile development --platform ios
```

---

## Expo Router v6

Expo Router v6 är en filbaserad router byggd på React Navigation med stöd för native tabs och Liquid Glass på iOS 26.

### Grundläggande routing

```tsx
// app/_layout.tsx - Root layout
import { Stack } from 'expo-router'

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Hem' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  )
}
```

```tsx
// app/index.tsx - Hemsida
import { Link } from 'expo-router'
import { View, Text } from 'react-native'

export default function Home() {
  return (
    <View>
      <Text>Välkommen!</Text>
      <Link href="/profile">Gå till profil</Link>
      <Link href="/user/123">Visa användare 123</Link>
    </View>
  )
}
```

### Dynamiska routes

```tsx
// app/user/[id].tsx
import { useLocalSearchParams } from 'expo-router'

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>()

  return <Text>Användare: {id}</Text>
}
```

### Native Tabs (iOS 26 Liquid Glass)

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router'
// Experimentell - prefix kan ändras
import { TabList, TabSlot, TabTrigger } from 'expo-router/ui'

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Hem',
          tabBarIcon: ({ color }) => <IconHome color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <IconUser color={color} />,
        }}
      />
    </Tabs>
  )
}
```

### Typed Routes

Expo Router genererar TypeScript-typer automatiskt för säker navigation:

```tsx
import { Link, router } from 'expo-router'

// Autocomplete för href
<Link href="/user/123">Profil</Link>

// Programmatisk navigation med typer
router.push('/user/123')
router.replace('/settings')
router.back()
```

### API Routes (Web only)

```tsx
// app/api/users+api.ts
export async function GET(request: Request) {
  const users = await db.users.findMany()
  return Response.json(users)
}

export async function POST(request: Request) {
  const body = await request.json()
  const user = await db.users.create({ data: body })
  return Response.json(user, { status: 201 })
}
```

> ⚠️ API Routes körs endast på web. För mobil, använd en separat backend.

---

## React 19 Kompatibilitet

> ⚠️ **KRITISKT:** Server Components (`'use server'`) fungerar **INTE** i React Native. Använd API routes eller extern backend istället.

| React 19 Feature | Stöd i Expo |
|------------------|-------------|
| `use()` hook | ✅ Fungerar |
| Suspense | ✅ Fungerar |
| `useActionState` | ✅ Fungerar |
| `useOptimistic` | ✅ Fungerar |
| Server Components | ❌ **Stöds EJ** |
| `'use server'` | ❌ **Stöds EJ** |
| Server Actions | ❌ **Stöds EJ** |

### Data fetching med use()

```tsx
import { use, Suspense } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'

function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise)

  return (
    <View>
      <Text>{user.name}</Text>
    </View>
  )
}

export default function ProfileScreen() {
  const userPromise = fetchUser() // Skapa promise utanför

  return (
    <Suspense fallback={<ActivityIndicator />}>
      <UserProfile userPromise={userPromise} />
    </Suspense>
  )
}
```

### Formulär med useActionState

```tsx
'use client'
import { useActionState } from 'react'
import { View, TextInput, Button, Text } from 'react-native'

type State = { error?: string; success?: boolean }

async function submitForm(prev: State, formData: FormData): Promise<State> {
  const response = await fetch('/api/submit', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    return { error: 'Något gick fel' }
  }

  return { success: true }
}

export function ContactForm() {
  const [state, formAction, isPending] = useActionState(submitForm, {})

  return (
    <View>
      <TextInput placeholder="Meddelande" />
      <Button
        title={isPending ? 'Skickar...' : 'Skicka'}
        disabled={isPending}
        onPress={() => formAction(new FormData())}
      />
      {state.error && <Text style={{ color: 'red' }}>{state.error}</Text>}
    </View>
  )
}
```

---

## EAS Build och Submit

EAS (Expo Application Services) hanterar builds och app store-submissions i molnet.

### Konfigurera EAS

```bash
# Installera EAS CLI
npm install -g eas-cli

# Logga in
eas login

# Initiera projekt
eas build:configure
```

### eas.json

```json
{
  "cli": {
    "version": ">= 15.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@email.com",
        "ascAppId": "1234567890"
      },
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "production"
      }
    }
  }
}
```

### Bygga och submita

```bash
# Development build (för testning)
eas build --profile development --platform all

# Production build
eas build --profile production --platform all

# Submita till app stores
eas submit --platform ios
eas submit --platform android

# Bygg och submit i ett steg
eas build --profile production --platform all --auto-submit
```

---

## Bygga och Testa utan Fysisk Enhet

I en Linux-servermiljö eller CI/CD-pipeline kan du verifiera att appen bygger korrekt och ser rätt ut utan fysiska enheter.

### Verifiera byggfel

#### 1. Lokal produktionsbuild

```bash
# iOS (kräver macOS)
npx expo run:ios --configuration Release

# Android (fungerar på Linux)
npx expo run:android --variant release

# EAS lokal build (samma som molnbygget)
eas build --local --platform android --profile production
```

#### 2. EAS Build --local med debugging

```bash
# Behåll arbetsmapp för felsökning
export EAS_LOCAL_BUILD_SKIP_CLEANUP=1
export EAS_LOCAL_BUILD_WORKINGDIR=/tmp/eas-build

eas build --local --platform android

# Inspektera byggloggar vid fel
ls /tmp/eas-build/logs/
```

#### 3. Expo export för web

```bash
# Exportera statisk webbuild
npx expo export -p web

# Testa lokalt
npx serve dist
# Öppna http://localhost:3000
```

### Testning utan fysisk enhet

#### Expo Web + Playwright (rekommenderat för Linux)

Det snabbaste sättet att verifiera UI på en headless server:

```bash
# 1. Starta expo web
npx expo start --web --no-dev &

# 2. Ta screenshot med Playwright
npx playwright screenshot http://localhost:8081 screenshot.png
```

**playwright.config.ts för Expo:**

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  use: {
    baseURL: 'http://localhost:8081',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npx expo start --web --no-dev',
    url: 'http://localhost:8081',
    reuseExistingServer: !process.env.CI,
  },
})
```

```typescript
// e2e/app.spec.ts
import { test, expect } from '@playwright/test'

test('app renders correctly', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveScreenshot('home.png')
})

test('navigation works', async ({ page }) => {
  await page.goto('/')
  await page.click('text=Profile')
  await expect(page).toHaveURL('/profile')
})
```

#### Android Emulator i Docker (headless)

För native Android-testning på Linux-servrar:

```yaml
# docker-compose.yml
services:
  android-emulator:
    image: budtmo/docker-android:emulator_14.0
    privileged: true
    ports:
      - "5555:5555"
      - "6080:6080"  # noVNC
    environment:
      - EMULATOR_DEVICE=pixel_7
      - WEB_VNC=true
```

```bash
# Starta emulator
docker compose up -d android-emulator

# Vänta på boot
adb wait-for-device

# Installera APK
eas build --local --platform android --profile preview
adb install ./build/*.apk
```

> ⚠️ **Krav:** Docker-hosten måste ha KVM-stöd aktiverat för acceptabel prestanda.

#### EAS Build för Simulator/Emulator

```json
// eas.json
{
  "build": {
    "simulator": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      },
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

```bash
# Bygg för simulator
eas build --profile simulator --platform all

# Ladda ner och kör (macOS med Expo Orbit)
eas build:run --platform ios --latest
```

### E2E-testning med Maestro

Maestro är det rekommenderade ramverket för E2E-tester med Expo:

```bash
# Installera Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash

# Skapa testflöde
mkdir -p .maestro
```

```yaml
# .maestro/login-flow.yaml
appId: com.myapp
---
- launchApp
- tapOn: "Email"
- inputText: "test@example.com"
- tapOn: "Password"
- inputText: "password123"
- tapOn: "Sign In"
- assertVisible: "Welcome"
```

```bash
# Kör test (kräver körande emulator/simulator)
maestro test .maestro/login-flow.yaml

# Spela in för debugging
maestro record .maestro/login-flow.yaml
```

**EAS Workflows med Maestro:**

```yaml
# .eas/workflows/e2e-android.yml
name: E2E Tests Android
on:
  pull_request:
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build APK
        run: eas build --profile simulator --platform android --local
      - name: Run Maestro tests
        uses: mobile-dev-inc/action-maestro-cloud@v1
        with:
          api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
          app-file: build/*.apk
```

### Visuell preview utan enhet

#### Appetize.io

Kör din app i webbläsaren via molnbaserade emulatorer:

```bash
# Bygg APK/IPA
eas build --profile preview --platform all

# Ladda upp till Appetize.io
# https://appetize.io/upload
```

#### Expo Snack

För snabb prototyp-testning direkt i webbläsaren:
- https://snack.expo.dev

### Rekommenderad CI/CD-pipeline

```yaml
# .github/workflows/test.yml
name: Build and Test
on: [push, pull_request]

jobs:
  # Steg 1: Typkontroll och lint
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint

  # Steg 2: Web build + Playwright screenshots
  web-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx expo export -p web
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  # Steg 3: Native builds (verifierar att de bygger)
  native-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
      # Endast Android på Linux
      - run: eas build --profile preview --platform android --non-interactive --no-wait
```

### Sammanfattning

| Metod | OS | Hastighet | Vad den testar |
|-------|-----|-----------|----------------|
| `expo export -p web` + Playwright | Linux/macOS/Windows | ⚡ Snabb | UI-rendering, navigation |
| `expo run:android --variant release` | Linux/macOS | 🔄 Medium | Native Android-build |
| Docker Android Emulator | Linux | 🐢 Långsam | Full native Android |
| EAS Build --local | Linux (Android) | 🐢 Långsam | Produktionsbuild |
| Maestro + Emulator | Linux/macOS | 🔄 Medium | E2E-flöden |
| Appetize.io | Webbläsare | ⚡ Snabb | Visuell preview |

> **Rekommendation för Linux-server:** Använd **Expo Web + Playwright** för snabb UI-verifiering och **EAS Build** i molnet för native builds. Docker-baserade Android-emulatorer fungerar men kräver KVM-stöd.

---

## Push Notifications

> ⛔ **KRAV: Development Build** — Push notifications fungerar **INTE** i Expo Go på Android sedan SDK 53. Du MÅSTE använda Development Build (`npx expo run:android` eller EAS Build) innan du implementerar push. Planera för detta från projektstart.

### Installation

```bash
npx expo install expo-notifications expo-device expo-constants
```

### Konfiguration

```json
// app.json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#ffffff"
        }
      ]
    ]
  }
}
```

### Registrera för push

```tsx
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

async function registerForPushNotifications() {
  if (!Device.isDevice) {
    console.warn('Push notifications kräver fysisk enhet')
    return null
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification-permission nekad')
    return null
  }

  // Hämta Expo push token
  const token = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  })

  // Android-specifik kanalconfig
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  return token.data
}
```

### Lyssna på notifications

```tsx
import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'

export function useNotifications() {
  const notificationListener = useRef<Notifications.EventSubscription>()
  const responseListener = useRef<Notifications.EventSubscription>()

  useEffect(() => {
    // Notification mottagen medan appen är öppen
    notificationListener.current = Notifications.addNotificationReceivedListener(
      notification => {
        console.log('Notification:', notification)
      }
    )

    // Användaren tryckte på notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      response => {
        const data = response.notification.request.content.data
        // Navigera baserat på data
      }
    )

    return () => {
      notificationListener.current?.remove()
      responseListener.current?.remove()
    }
  }, [])
}
```

---

## Native Modules med Expo Modules API

Expo Modules API låter dig skriva native kod i Swift och Kotlin.

### Skapa lokal modul

```bash
npx create-expo-module@latest --local my-module
```

### Swift-modul (iOS)

```swift
// modules/my-module/ios/MyModule.swift
import ExpoModulesCore

public class MyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MyModule")

    Function("hello") { (name: String) -> String in
      return "Hello, \(name)!"
    }

    AsyncFunction("fetchData") { (url: String) async throws -> String in
      let (data, _) = try await URLSession.shared.data(from: URL(string: url)!)
      return String(data: data, encoding: .utf8) ?? ""
    }
  }
}
```

### Kotlin-modul (Android)

```kotlin
// modules/my-module/android/src/main/java/expo/modules/mymodule/MyModule.kt
package expo.modules.mymodule

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MyModule")

    Function("hello") { name: String ->
      "Hello, $name!"
    }

    AsyncFunction("fetchData") { url: String ->
      // Async implementation
    }
  }
}
```

### Använda modulen

```tsx
import { MyModule } from './modules/my-module'

const greeting = MyModule.hello('World')
const data = await MyModule.fetchData('https://api.example.com')
```

---

## Config Plugins

Config plugins modifierar native-konfiguration vid prebuild utan att ejekta.

### Använda plugins

```json
// app.json
{
  "expo": {
    "plugins": [
      "expo-router",
      ["expo-notifications", { "icon": "./assets/icon.png" }],
      ["@react-native-google-signin/google-signin", {
        "iosUrlScheme": "com.googleusercontent.apps.YOUR_ID"
      }],
      "./my-custom-plugin"
    ]
  }
}
```

### Skapa custom plugin

```js
// my-custom-plugin.js
const { withInfoPlist, withAndroidManifest } = require('@expo/config-plugins')

module.exports = function myPlugin(config, props) {
  // Modifiera iOS Info.plist
  config = withInfoPlist(config, (config) => {
    config.modResults.NSCameraUsageDescription =
      'Appen behöver kameraåtkomst för att scanna QR-koder'
    return config
  })

  // Modifiera Android manifest
  config = withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application[0]
    mainApplication.$['android:usesCleartextTraffic'] = 'true'
    return config
  })

  return config
}
```

### Applicera plugins

```bash
# Generera native-projekt med plugins
npx expo prebuild

# Eller kör direkt (genererar automatiskt)
npx expo run:ios
npx expo run:android
```

---

## Breaking Changes SDK 53 → 54

### 1. expo-file-system

```tsx
// ❌ Gammalt (SDK 53)
import * as FileSystem from 'expo-file-system'
await FileSystem.writeAsStringAsync(path, content)

// ✅ Nytt (SDK 54) - objektorienterat API
import { File, Directory } from 'expo-file-system'

const file = new File(path)
await file.write(content)
await file.text() // Läs innehåll

const dir = new Directory(path)
await dir.create()

// Eller använd legacy-API för snabb migration
import * as FileSystem from 'expo-file-system/legacy'
```

### 2. expo-av → expo-audio + expo-video

```tsx
// ❌ Deprecated (SDK 54)
import { Audio, Video } from 'expo-av'

// ✅ Nytt (SDK 54)
import { useAudioPlayer, AudioPlayer } from 'expo-audio'
import { useVideoPlayer, VideoView } from 'expo-video'

function AudioExample() {
  const player = useAudioPlayer(require('./audio.mp3'))

  return (
    <Button title="Spela" onPress={() => player.play()} />
  )
}

function VideoExample() {
  const player = useVideoPlayer('https://example.com/video.mp4')

  return (
    <VideoView
      player={player}
      style={{ width: 300, height: 200 }}
    />
  )
}
```

### 3. Background Tasks

```tsx
// ❌ Deprecated
import * as BackgroundFetch from 'expo-background-fetch'

// ✅ Nytt (SDK 54)
import * as BackgroundTask from 'expo-background-task'

BackgroundTask.defineTask('MY_TASK', async () => {
  // Utför bakgrundsarbete
  return BackgroundTask.BackgroundTaskResult.Success
})
```

### 4. SafeAreaView

```tsx
// ❌ Deprecated
import { SafeAreaView } from 'react-native'

// ✅ Korrekt
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context'

// Wrappa app med provider
export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <MyContent />
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
```

### 5. Reanimated v4

```tsx
// SDK 54 kräver Reanimated v4 för New Architecture
// OBS: react-native-worklets ingår nu automatiskt

// babel.config.js - Ta BORT duplicerade plugins
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    'react-native-reanimated/plugin',
    // ❌ Ta BORT - ingår redan i reanimated/plugin
    // 'react-native-worklets/plugin',
  ],
}
```

### 6. Övriga breaking changes

```json
// app.json - statusBar borttagen från root
{
  "expo": {
    // ❌ Borttaget
    "statusBar": { "style": "dark" },

    // ✅ Korrekt - i native config
    "ios": {
      "infoPlist": {
        "UIStatusBarStyle": "UIStatusBarStyleDarkContent"
      }
    }
  }
}
```

```json
// Ikoner måste vara kvadratiska (samma width och height)
{
  "expo": {
    "icon": "./assets/icon.png"  // Måste vara t.ex. 1024x1024
  }
}
```

---

## Felsökning

### "JSC is not supported"

JSC har inget officiellt stöd i SDK 54 - Hermes är standard. Om du behöver JSC finns community-paketet `@aspect-build/jsc`, men det rekommenderas att migrera till Hermes.

```json
// app.json - Verifiera att Hermes är aktiverat
{
  "expo": {
    "jsEngine": "hermes"  // Default, kan utelämnas
  }
}
```

### Metro package.json exports-fel

```bash
# Om tredjepartsbibliotek har inkompatibla exports
npx expo install --fix

# Eller uppdatera det specifika paketet
npx expo install problematic-package@latest
```

### Prebuild-fel efter uppgradering

```bash
# Radera native-kataloger och regenerera
rm -rf ios android
npx expo prebuild --clean
```

### Node-versionsfel

```bash
# SDK 54 kräver Node 20.19+
node --version

# Uppdatera med nvm
nvm install 20
nvm use 20
```

---

## Produktions-checklista

- [ ] Använd Development Build, inte Expo Go
- [ ] Migrera från expo-av till expo-audio/expo-video
- [ ] Migrera från expo-background-fetch till expo-background-task
- [ ] Använd react-native-safe-area-context
- [ ] Verifiera att alla ikoner är kvadratiska
- [ ] Ta bort statusBar från app.json root
- [ ] Uppdatera expo-file-system imports
- [ ] Testa på fysiska enheter
- [ ] Konfigurera EAS Build för produktion
- [ ] Sätt upp push notifications med Development Build (⛔ fungerar INTE i Expo Go sedan SDK 53)

---

## Referenser

- [Expo SDK 54 Changelog](https://expo.dev/changelog/sdk-54)
- [Expo SDK Upgrade Guide](https://expo.dev/blog/expo-sdk-upgrade-guide)
- [Expo Router v6](https://expo.dev/blog/expo-router-v6)
- [Expo File System Upgrade](https://expo.dev/blog/expo-file-system)
- [Expo Documentation](https://docs.expo.dev)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [Push Notifications](https://docs.expo.dev/push-notifications/overview/)
- [Expo Modules API](https://docs.expo.dev/modules/overview/)
- [Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)
