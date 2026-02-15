# Socket Refactor — SocketProvider + Context

## Bakgrund

Nuvarande `useSocket`-hook skapar en ny Socket.IO-anslutning per komponent som anropar den. Det finns 8 konsumenter, varav flera kan vara monterade samtidigt (t.ex. topbar + project-view + dashboard-wrapper). Det leder till:

1. **Flera parallella WebSocket-anslutningar** istället för en
2. **Instabil anslutning** — alla ~30 callbacks finns i useEffect dependency-arrayen, så socketen kopplas ned/upp vid varje re-render om en callback-referens ändras
3. **Svårt att utöka** — varje nytt event kräver ändringar i use-socket.ts OCH i varje konsument

## Mål

Refaktorera till en **SocketProvider** + **useSocketEvent**-mönster:

- **En enda** Socket.IO-anslutning per session, skapad i dashboard-layouten
- Varje komponent registrerar **bara de events den bryr sig om** via en lättvikts-hook
- Anslutningen är **stabil** — inga reconnects pga re-renders
- `joinProjectRoom` exponeras via context

## Ny arkitektur

```
DashboardShell
  └── SocketProvider          ← EN anslutning, stabil
        ├── Topbar            ← useSocketEvent("notification:new", handler)
        ├── ProjectView       ← useSocketEvent("task:created", handler) + joinProjectRoom
        ├── PersonalView      ← useSocketEvent("note:created", handler)
        └── ...
```

## Regler

- Alla agenter ska läsa `/workspace/AGENTS.md` och `/workspace/DEVLOG.md`
- Verifieringsagenter får INTE ändra kod
- En agent i taget (sekventiellt)
- Implementation → Verifiering → Test → Commit

## Filer som berörs

### Nya filer
- `web/src/contexts/socket-context.tsx` — SocketProvider + useSocketEvent + useJoinProjectRoom

### Ändrade filer
- `web/src/hooks/use-socket.ts` — Behålls som tunn wrapper (bakåtkompatibilitet) ELLER tas bort
- `web/src/app/[locale]/(dashboard)/_components/dashboard-shell.tsx` — Wrappa children med SocketProvider
- `web/src/components/projects/project-view.tsx` — Migrera till useSocketEvent
- `web/src/components/dashboard/dashboard-realtime-wrapper.tsx` — Migrera
- `web/src/components/personal/personal-view.tsx` — Migrera
- `web/src/app/[locale]/(dashboard)/_components/topbar.tsx` — Migrera
- `web/src/components/projects/projects-list-wrapper.tsx` — Migrera
- `web/src/components/settings/member-management.tsx` — Migrera
- `web/src/components/invitations/invitation-list.tsx` — Migrera
- `web/src/components/ai/personal-ai-chat.tsx` — Migrera
