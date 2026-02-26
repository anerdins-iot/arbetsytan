# Discord Bot – inventering av funktioner

Analys av vad Discord-botten kan idag (events, services, handlers). Ingen `commands/`-mapp; interaktion sker via meddelanden, knappar, select-menyer och modaler.

---

## Kommandon (slash commands)

**Inga.** Botten har inga slash commands. Användning sker via:

- **DM eller @-mention / svar på botten** → AI-chatt eller filhantering
- **Knappar på embeds** (t.ex. notiser) → Visa uppgift, Tilldela, Markera klar, Logga tid, Öppna i webb
- **Select-meny** → Välj person att tilldela till uppgift
- **Modaler** → Logga tid (timmar + beskrivning), Skapa uppgift (titel, beskrivning, deadline)

---

## Discord.js-events som hanteras

| Event | Fil | Vad som görs |
|-------|-----|----------------|
| `ClientReady` | `events/ready.ts` | Loggar “Bot online”, antal guilds |
| `MessageCreate` | `events/messageCreate.ts` | Reagerar på meddelande i DM, vid @-mention eller svar på botten → användaridentifiering, rate limit, kontext, anropar AI-handler eller filhantering |
| `InteractionCreate` | `events/interactionCreate.ts` | Routar till `handleButton`, `handleSelectMenu` eller `handleModalSubmit` |

---

## Redis-kanaler (web → bot)

Botten prenumererar på följande kanaler och reagerar enligt tabellen.

| Kanal | Handläggare | Effekt |
|-------|-------------|--------|
| `discord:user-linked` | `handleUserLinked` | Ger användaren roller (Medlem + systemroll) i guild |
| `discord:user-unlinked` | `handleUserUnlinked` | Tar bort alla hanterade roller |
| `discord:user-role-changed` | `handleUserRoleChanged` | Synkar Discord-roll efter systemrolländring |
| `discord:user-deactivated` | `handleUserDeactivated` | Tar bort alla roller |
| `discord:project-created` | `handleProjectCreated` | Skapar projektkanal under kategori “Projekt” (om konfigurerad) |
| `discord:project-archived` | `handleProjectArchived` | Arkiverar projektkanal (flyttar till Arkiv-kategori) |
| `discord:project-member-added` | `handleProjectMemberAdded` | Ger medlem ViewChannel på projektkanalen |
| `discord:project-member-removed` | `handleProjectMemberRemoved` | Tar bort ViewChannel för medlem |
| `discord:category-created` | `handleCategoryCreated` | Synkar kategori-struktur (skapar Discord-kategori) |
| `discord:category-deleted` | `handleCategoryDeleted` | Raderar Discord-kategori |
| `discord:category-sync` | `handleCategorySync` | Full synk av kategori-struktur från admin |
| `discord:task-created` | `handleTaskCreated` | Skickar notis till projektkanal (embed + knappar) |
| `discord:task-assigned` | `handleTaskAssigned` | Notis till projektkanal + DM till tilldelad (om Discord kopplat) |
| `discord:task-completed` | `handleTaskCompleted` | Notis till projektkanal |
| `discord:comment-added` | `handleCommentAdded` | Notis till projektkanal |
| `discord:file-uploaded` | `handleFileUploaded` | Notis till projektkanal |
| `discord:time-logged` | `handleTimeLogged` | Notis till projektkanal (tidsrapport) |
| `discord:verify-guild` | `handleVerifyGuild` | Svarar på `discord:verify-response` med guild-verifiering (requestId + status) |

---

## Vad användare kan göra via Discord

### Koppling och åtkomst

- **Koppla konto:** Får embed “Konto ej kopplat” med knapp “Koppla ditt konto” → länk till webb `.../settings`.
- **Rate limit:** Max 10 AI-förfrågningar/minut; vid överskridande visas embed med vänttid.

### AI-chatt

- **Var:** DM till botten, eller i guild-kanal genom @-mention eller svar på bottens meddelande.
- **Kontext:** Senaste ~20 meddelanden i kanalen, projektkontext om kanalen är kopplad till ett projekt.
- **Text:** Skickas till webbens `/api/internal/discord-chat` → AI svarar; svaret skickas tillbaka (med “thinking”-redigering vid långa svar).
- **Bilder:** Bildbilagor skickas till AI (vision); första bilden analyseras, ev. text används som prompt.
- **Konversations-ID:** Cachelagras per kanal/DM och kopplas till Conversation i DB (discordChannelId / discordUserId).

### Filer och bilder

- **Bild (i projektkanal eller DM):** Analyseras av AI (vision). I projektkanal kan andra filer också laddas upp.
- **Fil (ej bild) i projektkanal:** Laddas upp till S3/MinIO, `File`-post skapas; bekräftelse-embed skickas. Max 50 MB. Kräver att lagring är konfigurerad.
- **Fil i DM eller icke-projektkanal:** Ingen filuppladdning; uppmaning att använda projektkanal.

### Uppgifter (tasks)

- **Visa detaljer:** Knapp `task_view_<taskId>` → ephemeral embed med uppgift + knappar (Tilldela, Klar, Logga tid, Öppna i webb).
- **Markera klar:** Knapp `task_complete_<taskId>` → sätter status DONE.
- **Tilldela:** Knapp `task_assign_<taskId>` → visar select-meny med projektmedlemmar; val → `assign_user_<taskId>` skapar TaskAssignment.
- **Logga tid:** Knapp `time_log_<taskId>` → öppnar modal (timmar, beskrivning); submit `time_log_modal_<taskId>` skapar TimeEntry.
- **Skapa uppgift:** Modal-submit `task_create_modal_<projectId>` hanteras (skapar Task med titel, beskrivning, deadline). **OBS:** `createTaskModal(projectId)` finns i `components/modals.ts` men anropas inte från någon knapp eller flöde i botten – användaren har alltså idag inget sätt att öppna “Skapa uppgift”-modalen från Discord (endast submit är implementerat).

### Bekräftelseknappar

- `confirm_yes_<actionId>` / `confirm_no_<actionId>` → uppdaterar meddelande till “Bekräftat” / “Avbrutet” och tar bort komponenter. (Används inte aktivt i nuvarande handlers.)

---

## Services (översikt)

| Service | Huvudfunktion |
|---------|----------------|
| `redis-listener.ts` | Prenumererar på alla `discord:*`-kanaler, parsar JSON, anropar respektive handler. |
| `notification.ts` | `sendTaskNotification`, `sendCommentNotification`, `sendFileNotification`, `sendTimeEntryNotification` – skickar embeds till projektkanal (och DM vid task-assigned). |
| `channel.ts` | `createProjectChannel`, `archiveProjectChannel`, `updateChannelPermissions`, `syncCategoryStructure`, `getOrCreateCategory`, `toChannelName`. |
| `roles.ts` | `grantRolesToUser`, `revokeAllRoles`, `syncUserRole` – mappar systemroller till Discord-roller (Admin, Projektledare, Montör, m.m.). |
| `user-identification.ts` | `identifyUser`, `getTenantFromGuild`, `validateProjectAccess` – kopplar Discord-användare till User/Membership och projektåtkomst. |
| `context.ts` | `buildMessageContext`, `getChannelContext` – senaste meddelanden och projektkontext för kanal. |
| `ai-adapter.ts` | `callAI` – POST till webbens `/api/internal/discord-chat` med användar-/projekt-/konversationsdata och meddelanden (inkl. bild-base64). |
| `storage.ts` | `uploadToStorage`, `isStorageConfigured` – S3/MinIO-uppladdning för filbilagor i projektkanaler. |

---

## Vad som saknas jämfört med webb

- **Inga slash commands** – all interaktion via meddelanden och komponenter på embeds.
- **Skapa uppgift:** Modalen för att skapa uppgift finns och submit hanteras, men **ingen knapp eller annan trigger** visar modalen – användare kan alltså inte skapa uppgift från Discord idag.
- **Skapa projekt:** Kan inte skapas från Discord; projekt skapas i webben → Redis `project-created` → botten skapar kanal.
- **Redigera uppgift:** Endast “Markera klar” och “Tilldela”; ingen redigering av titel, beskrivning, deadline eller prioritet.
- **Kommentarer:** Endast notiser när någon kommenterar (från webb); kan inte skriva eller läsa kommentarer från Discord.
- **Anteckningar:** Ingen hantering av anteckningar i botten.
- **Rapporter / offerter:** Ingen funktionalitet i botten.
- **E-post:** Ingen integration med e-post från Discord.
- **Kunskapsbas / RAG:** AI får kontext via webbens API; ingen direkt RAG-/sökning exponerad som separat funktion i botten.

---

## Sammanfattning

- **Kommandon:** Inga slash commands; användning via DM/@/svar, knappar, select och modaler.
- **Events:** ClientReady, MessageCreate, InteractionCreate.
- **Redis:** 18 kanaler för användar-/projekt-/kategori-/uppgift-/kommentar-/fil-/tid-events och guild-verifiering.
- **Användare kan:** koppla konto, chatta med AI (text + bild), ladda upp filer i projektkanaler, visa/klarmarkera/tilldela uppgifter och logga tid; **kan inte** från Discord öppna “Skapa uppgift”-modalen eller skapa/redigera projekt, kommentarer eller anteckningar.
