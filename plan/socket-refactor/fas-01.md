# Fas 1: Skapa SocketProvider + hooks

> **INNAN DU BÖRJAR:** Läs `/workspace/plan/socket-refactor/README.md`, `/workspace/AGENTS.md`, `/workspace/DEVLOG.md`

---

## Block 1.1: Skapa SocketProvider och useSocketEvent

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Skapa `web/src/contexts/socket-context.tsx` med:

1. **SocketProvider** — React Context-provider som:
   - Skapar EN Socket.IO-anslutning vid mount (om `enabled`)
   - Hanterar reconnection-logik
   - Exponerar `socket`, `status`, `joinProjectRoom` via context
   - Anslutningen skapas med samma konfiguration som nuvarande `use-socket.ts`:
     ```typescript
     io(getSocketUrl(), {
       path: getSocketPath(),
       withCredentials: true,
       reconnection: true,
       autoConnect: true,
       transports: ["websocket", "polling"],
     })
     ```
   - Tar emot `mobileToken` som optional prop för auth

2. **useSocketEvent** — Lättvikts-hook som:
   - Tar `eventName: string` och `handler: (payload) => void`
   - Hämtar socket från context
   - Registrerar `socket.on(eventName, handler)` i useEffect
   - Cleanup: `socket.off(eventName, handler)`
   - Använder `useRef` för handler-referensen så att socketen ALDRIG kopplas ned/upp
   - Dependency-array: BARA `[socket, eventName]` — INTE handler

3. **useSocketStatus** — Returnerar `status: "connecting" | "connected" | "disconnected"`

4. **useJoinProjectRoom** — Returnerar `joinProjectRoom(projectId: string) => Promise<boolean>`

### Fil att skapa

`/workspace/web/src/contexts/socket-context.tsx`

### Referens

Läs nuvarande implementation i `/workspace/web/src/hooks/use-socket.ts` för:
- `getSocketUrl()` och `getSocketPath()` (kopiera dessa)
- `SOCKET_EVENTS` importeras från `@/lib/socket-events`
- Anslutningslogik (connect, disconnect, reconnect_attempt)

### Design

```typescript
// SocketProvider props
type SocketProviderProps = {
  children: React.ReactNode;
  enabled: boolean;        // Styr om anslutning skapas
  mobileToken?: string;    // Optional auth token
};

// useSocketEvent — generisk, typsäker
function useSocketEvent<T = unknown>(
  eventName: string,
  handler: (payload: T) => void
): void;

// useSocketStatus
function useSocketStatus(): "connecting" | "connected" | "disconnected";

// useJoinProjectRoom
function useJoinProjectRoom(): (projectId: string) => Promise<boolean>;
```

### Krav

- Socket skapas i useMemo/useRef — ALDRIG i useEffect dependency
- Handler-referens via useRef — inga onödiga reconnects
- Exportera SOCKET_EVENTS från socket-events.ts (inte duplicera)
- "use client" direktiv

### Verifiering

- [ ] Filen kompilerar utan TypeScript-fel
- [ ] `npm run build` utan fel (inga konsumenter ännu, bara nya filen)
- [ ] Ingen duplication av SOCKET_EVENTS

---

## Block 1.2: Montera SocketProvider i DashboardShell

**Agenttyp:** Implementation (Cursor Auto)

### Uppgift

Wrappa children i `DashboardShell` med `SocketProvider`.

### Fil att ändra

`/workspace/web/src/app/[locale]/(dashboard)/_components/dashboard-shell.tsx`

### Ändringar

```typescript
import { SocketProvider } from "@/contexts/socket-context";

// Inuti DashboardShell-komponenten, wrappa runt children:
<SocketProvider enabled={true}>
  {/* befintligt innehåll */}
</SocketProvider>
```

SocketProvider ska wrappa allt innehåll inuti DashboardShell (dvs sidebar, topbar, children, AI-chat).

### Krav

- Alla dashboard-komponenter ska ha tillgång till socket-context
- Ingen förändring i beteende ännu (inga konsumenter migrerade)

### Verifiering

- [ ] `npm run build` utan fel
- [ ] DashboardShell renderar korrekt
- [ ] SocketProvider skapar en anslutning (verifiera i browser console)

---

## Block 1.3: Verifiering av Fas 1

**Agenttyp:** Verifiering (Gemini 3 Flash)

> Du är en GRANSKARE. Du får INTE ändra några filer. Läs, analysera och rapportera.

### Kontrollpunkter

- [ ] `web/src/contexts/socket-context.tsx` existerar och exporterar: `SocketProvider`, `useSocketEvent`, `useSocketStatus`, `useJoinProjectRoom`
- [ ] Handler-referens använder `useRef` (INTE i dependency-array)
- [ ] Socket skapas en gång, inte vid varje render
- [ ] `dashboard-shell.tsx` wrappar med `SocketProvider`
- [ ] `npm run build` utan fel
- [ ] TypeScript: `npx tsc --noEmit` utan fel

### Rapportera

GODKÄNT eller UNDERKÄNT med lista över avvikelser.

---

## Checkpoint Fas 1

- [x] Block 1.1: SocketProvider + useSocketEvent skapad
- [x] Block 1.2: Monterad i DashboardShell
- [x] Block 1.3: Verifiering godkänd (Gemini)
- [ ] Commit (slås ihop med Fas 2)
