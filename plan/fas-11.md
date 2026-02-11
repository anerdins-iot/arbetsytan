# Fas 11 — Mobilapp (Expo)

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/docs/*.md` innan implementation.

### Block 11.1: Expo-setup och auth
**Input:** Fas 2 klar (auth-endpoints), `/docs/expo.md`
**Output:** Expo-projekt med autentisering

- [ ] Initiera Expo SDK 54-projekt med TypeScript
- [ ] Konfigurera Expo Router v6 för navigation
- [ ] Implementera JWT-autentisering med expo-secure-store
- [ ] Skapa API-klient som skickar Bearer token
- [ ] Inloggningsskärm

**Verifiering:** App startar, inloggning fungerar mot backend, token sparas säkert

### Block 11.2: Grundläggande skärmar
**Input:** Block 11.1 klart
**Output:** Alla grundskärmar

- [ ] Dashboard med "mina uppgifter"
- [ ] Projektlista
- [ ] Projektvy med uppgifter och filer
- [ ] AI-chatt (personlig + projekt)
- [ ] Inställningar

**Verifiering:** Alla skärmar renderas, data hämtas från API, navigation fungerar

### Block 11.3: Mobilspecifikt
**Input:** Block 11.2 klart
**Output:** Mobilspecifika funktioner

- [ ] Push-notifikationer via Expo Push API
- [ ] Kamera-integration för bilduppladdning direkt
- [ ] Offline-stöd för uppgiftslistan (cache)

**Verifiering:** Push-notifikationer fungerar, kamera laddar upp bilder, offline-cache fungerar

### Block 11.4: Build och distribution
**Input:** Block 11.2 + 11.3 klara
**Output:** Buildkonfiguration och distribution

- [ ] Konfigurera EAS Build för Android och iOS
- [ ] Testflight (iOS) och intern testning (Android)
- [ ] App Store och Google Play-publicering

**Verifiering:** EAS Build lyckas, appen installeras på testenheter
