# Fas 11 — Mobilapp (Expo)

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/workspace/docs/*.md` innan implementation.

### Block 11.1: Expo-setup och auth
**Input:** Fas 2 klar (auth), `/workspace/docs/expo.md`
**Output:** Expo-projekt med autentisering

- [x] Initiera Expo SDK 54-projekt i `mobile/` med TypeScript
- [x] Konfigurera Expo Router v6 för navigation
- [x] Implementera JWT-autentisering med expo-secure-store
- [x] Skapa API-klient som skickar Bearer token
- [x] Skapa JWT-endpoint `web/src/app/api/auth/mobile/route.ts` — tar e-post+lösenord, returnerar JWT med `tenantId`, `userId`, `role`
- [x] Konfigurera JWT-livslängd och refresh-token-strategi (kort access token + längre refresh token)
- [x] Skapa JWT-verifieringslogik i `web/src/lib/auth-mobile.ts`
- [x] Inloggningsskärm

**Verifiering:** App startar, inloggning fungerar mot backend, token sparas säkert, JWT innehåller `tenantId`/`userId`/`role`, refresh fungerar

### Block 11.2: Grundläggande skärmar
**Input:** Block 11.1 + Fas 3 + Fas 4 + Fas 5 klara
**Output:** Alla grundskärmar

- [x] Dashboard med "mina uppgifter"
- [x] Projektlista
- [x] Projektvy med uppgifter och filer
- [x] AI-chatt (personlig + projekt)
- [x] Inställningar

**Verifiering:** Alla skärmar renderas, data hämtas från API med JWT, API-endpoints använder `tenantDb(tenantId)` och `requireProject()`, AI-chatt skyddas med JWT + tenantId, navigation fungerar

### Block 11.3: Mobilspecifikt
**Input:** Block 11.2 klart
**Output:** Mobilspecifika funktioner

- [ ] Konfigurera `socket.io-client` för React Native med JWT-auth
- [ ] Push-notifikationer via Expo Push API (komplement till Socket.IO)
- [ ] Kamera-integration för bilduppladdning direkt
- [ ] Offline-stöd för uppgiftslistan (cache)

**Verifiering:** Socket.IO fungerar i appen med JWT-auth, push-notifikationer fungerar, kamera laddar upp bilder, offline-cache fungerar, `tenantDb(tenantId)` på alla API-endpoints

### Block 11.4: Build och distribution
**Input:** Block 11.2 + 11.3 klara
**Output:** Buildkonfiguration och distribution

- [ ] Konfigurera EAS Build för Android och iOS
- [ ] Testflight (iOS) och intern testning (Android)
- [ ] App Store och Google Play-publicering

**Verifiering:** EAS Build lyckas, appen installeras på testenheter

### Block 11.5: Expo-test för Fas 11
**Input:** Block 11.1–11.4 klara
**Output:** Screenshots via Expo simulator

- [ ] Starta Expo dev-server
- [ ] Starta iOS/Android simulator
- [ ] Ta screenshot av inloggningsskärmen
- [ ] Logga in och ta screenshot av dashboard
- [ ] Navigera till projektlista, ta screenshot
- [ ] Öppna ett projekt, ta screenshot
- [ ] Öppna AI-chatt, ta screenshot
- [ ] Öppna inställningar, ta screenshot
- [ ] Verifiera push-notifikation (om möjligt)
- [ ] Spara alla screenshots i `screenshots/fas-11/`
- [ ] Stoppa Expo

**Verifiering:** Alla screenshots sparade, app fungerar i simulator, inga konsolfel
