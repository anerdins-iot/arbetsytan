# GAP-analys: AI-chatt vs Discord-bot

Jämförelse mellan personlig AI-chatt (webb, 115 verktyg) och Discord-bottens funktioner (events, knappar, modaler, AI-anrop). Källfiler: `01-ai-chat-functions.md`, `02-ui-server-actions.md`, `03-discord-bot-functions.md`.

---

## Sammanfattning

| Kanál | Antal funktioner |
|-------|------------------|
| **AI-chatt (webb)** | 115 verktyg (+ 1 provider-specifik: web_search) |
| **Discord-bot** | ~6–7 tydliga användarflöden (visa uppgift, klarmarkera, tilldela, logga tid, filuppladdning, AI-chatt; "skapa uppgift" har modal men ingen trigger) |
| **Gap** | **108+** funktioner saknar motsvarande dedikerad Discord-UI (slash command, knapp, modal eller tydligt flöde). Via Discord-AI-chatt kan användaren i teorin be AI:n anropa samma verktyg om backend exponerar dem – men det finns ingen dokumentation om att alla 115 verktyg är tillgängliga från `/api/internal/discord-chat`. |

*Antal saknade räknat som: alla AI-verktyg utom de som har explicit Discord-implementering (knapp/modal/Redis-event).*

---

## Funktioner som SAKNAS i Discord (prioritetsordning)

### Kritiska (måste finnas för grundläggande paritet)

1. **Skapa projekt** – AI: `createProject`; Discord: SAKNAS (projekt skapas i webb → Redis `project-created` → bot skapar kanal).
2. **Skapa uppgift** – AI: `createTask`; Discord: Modal + submit finns (`task_create_modal_<projectId>`), men **ingen knapp eller annan trigger** som öppnar modalen – användare kan inte skapa uppgift från Discord idag.
3. **Redigera uppgift** – AI: `updateTask` (titel, beskrivning, status, prioritet, deadline); Discord: Endast "Markera klar" (status DONE) och "Tilldela" – ingen redigering av titel, beskrivning, deadline eller prioritet.
4. **Radera uppgift** – AI: `deleteTask`; Discord: SAKNAS.
5. **Kommentarer – läsa** – AI: `getTaskComments`; Discord: SAKNAS (endast notis när någon kommenterar från webb).
6. **Kommentarer – skapa/uppdatera/radera** – AI: `createComment`, `updateComment`, `deleteComment`; Discord: SAKNAS.
7. **Tidsrapport – uppdatera/radera** – AI: `updateTimeEntry`, `deleteTimeEntry`; Discord: Endast skapa (modal "Logga tid"); ingen redigering eller radering.
8. **Projektlista och projektinfo** – AI: `getProjectList`, `getProjectDetail`; Discord: Ingen dedikerad command eller meny; användaren måste gå via AI-chatt eller webb.

### Viktiga

9. **Uppdatera/arkivera projekt** – AI: `updateProject`, `archiveProject`; Discord: SAKNAS (arkivering triggas från webb via Redis).
10. **Ta bort tilldelning** – AI: `unassignTask`; Discord: SAKNAS (endast tilldela).
11. **Tidsöversikt** – AI: `getProjectTimeSummary`, `getMyTimeEntries`, `getProjectTimeEntries`; Discord: SAKNAS.
12. **Smart tidrapportering** – AI: `smartLogTime`; Discord: SAKNAS.
13. **Filer – lista, sök, radera, förhandsgranska** – AI: `listFiles`, `searchFiles`, `deleteFile`, `getFilePreviewUrl`; Discord: Filuppladdning finns; lista/sök/radera/preview SAKNAS.
14. **OCR/dokumentanalys** – AI: `analyzeDocument`, `analyzePersonalFile`, `analyzeImage`; Discord: Bild skickas till AI (vision); dedikerad dokument-/OCR-flöde SAKNAS.
15. **Projektmedlemmar – lista, lägg till, ta bort** – AI: `listMembers`, `getAvailableMembers`, `addMember`, `removeMember`; Discord: SAKNAS (endast Redis-events för synk av kanalrättigheter).
16. **Projektanteckningar** – AI: `getProjectNotes`, `createNote`, `updateNote`, `deleteNote`, `toggleNotePin`, `searchNotes`, bilagor; Discord: SAKNAS.
17. **Personliga anteckningar** – AI: `getPersonalNotes`, `createPersonalNote`, uppdatera, radera, fästa, sök, bilagor; Discord: SAKNAS.
18. **Anteckningskategorier** – AI: `listNoteCategories`, `createNoteCategory`, `updateNoteCategory`, `deleteNoteCategory`; Discord: SAKNAS.
19. **Inbjudan – skicka, lista, avbryt** – AI: `sendInvitation`, `listInvitations`, `cancelInvitation`; Discord: SAKNAS.
20. **Notifieringar – lista, markera läst** – AI: `getNotifications`, `markNotificationRead`, `markAllNotificationsRead`, inställningar; Discord: Embeds skickas vid events; ingen dedikerad "mina notifieringar" eller inställningar.

### Bra att ha

21. **Rapporter och dokument** – AI: `generateProjectReport`, `createReport`, `generatePdf`, `generateExcel`, `generateWord`; Discord: SAKNAS.
22. **Excel/Word – läsa, redigera, mallar** – AI: `readExcelFile`, `editExcelFile`, `readWordFile`, `analyzeDocumentTemplate`, `fillDocumentTemplate`, `listDocumentTemplates`, `getTemplateDetails`; Discord: SAKNAS.
23. **E-postmallar (admin)** – AI: `listEmailTemplates`, `getEmailTemplate`, `updateEmailTemplate`, `previewEmailTemplate`; Discord: SAKNAS.
24. **Förbered/skicka e-post** – AI: `prepareEmailToExternalRecipients`, `prepareEmailToTeamMembers`, `prepareEmailToProjectMembers`, `getTeamMembersForEmailTool`, `getProjectsForEmailTool`, `getProjectMembersForEmailTool`; Discord: SAKNAS.
25. **E-postsökning och konversationer** – AI: `searchMyEmails`, `getConversationContext`, `getMyRecentEmails`; Discord: SAKNAS.
26. **Chatthistorik (AI-konversationer)** – AI: `searchConversations`; Discord: SAKNAS.
27. **Offert – skapa, lista, detalj, rader, status** – AI: `createQuote`, `listQuotes`, `getQuote`, `createQuoteDb`, `addQuoteItem`, `suggestQuoteItems`, `updateQuoteStatus`; Discord: SAKNAS.
28. **Grossistsökning** – AI: `searchSupplierProducts`; Discord: SAKNAS.
29. **Inköpslistor** – AI: `getShoppingLists`, `createShoppingList`, `addToShoppingList`, `toggleShoppingItem`, `searchAndAddToShoppingList`; Discord: SAKNAS.
30. **Automatiseringar** – AI: `createAutomation`, `listAutomations`, `getAutomation`, `updateAutomation`, `pauseAutomation`, `resumeAutomation`, `deleteAutomation`; Discord: SAKNAS.
31. **Personliga filer** – AI: `getPersonalFiles`, `movePersonalFileToProject`, `moveProjectFileToPersonal`, `deletePersonalFile`; Discord: Filuppladdning endast i projektkanal; personliga filer SAKNAS.
32. **Webbsökning** – AI: `web_search` (provider-specifik); Discord: Om discord-chat använder samma provider kan det finnas; annars SAKNAS som explicit funktion.

---

## Funktioner som redan finns i Discord

- **Visa uppgift** ✓ – Knapp `task_view_<taskId>` → ephemeral embed med uppgift + knappar (Tilldela, Klar, Logga tid, Öppna i webb).
- **Markera uppgift klar** ✓ – Knapp `task_complete_<taskId>` → sätter status DONE.
- **Tilldela uppgift** ✓ – Knapp `task_assign_<taskId>` → select-meny med medlemmar → `assign_user_<taskId>` skapar TaskAssignment.
- **Logga tid** ✓ – Knapp `time_log_<taskId>` → modal (timmar, beskrivning) → submit skapar TimeEntry.
- **Filuppladdning (projektkanal)** ✓ – Filer i projektkanal laddas upp till S3/MinIO, File-post skapas; bekräftelse-embed. Max 50 MB.
- **AI-chatt (text + bild)** ✓ – DM eller @-mention/svar → `/api/internal/discord-chat`; bilder analyseras med vision.
- **Koppla konto** ✓ – Embed med knapp "Koppla ditt konto" → länk till webb inställningar.
- **Notiser i kanal** ✓ – Redis-events: task-created, task-assigned, task-completed, comment-added, file-uploaded, time-logged → embeds i projektkanal (och DM vid task-assigned).
- **Projektkanal skapas/arkiveras** ✓ – Via Redis `project-created` / `project-archived` (webb är trigger).
- **Rollsynk** ✓ – Redis: user-linked, user-unlinked, user-role-changed, user-deactivated → roller i guild.

*OBS: "Skapa uppgift" räknas inte som "finns" eftersom modalen inte kan öppnas av användaren (ingen trigger).*

---

## Rekommenderad implementationsordning

1. **Först: Slash commands för grundläggande CRUD**
   - `/projekt lista` / `/project list` – motsvarar `getProjectList`.
   - `/projekt visa <id>` – `getProjectDetail`.
   - `/uppgift skapa` eller knapp "Skapa uppgift" som öppnar befintlig modal – så att `createTask` blir användbart.
   - `/uppgift redigera <id>` (eller knapp på task-embed) – `updateTask` (titel, beskrivning, deadline, prioritet).
   - `/uppgift radera <id>` (med bekräftelse) – `deleteTask`.
   - `/kommentar lista <taskId>` och `/kommentar skapa <taskId> <text>` – `getTaskComments`, `createComment` (ev. även update/delete).
   - `/tid lista` / `/tid sammanfattning` – `getProjectTimeEntries`, `getProjectTimeSummary`; plus möjlighet att uppdatera/radera tidsrapport (knapp eller command).

2. **Sedan: Projekt och medlemmar**
   - `/projekt skapa <namn>` – `createProject` (ev. med valfri beskrivning/adress).
   - `/projekt uppdatera` / `arkivera` – `updateProject`, `archiveProject`.
   - `/medlemmar lista` och knappar eller subcommands för `addMember` / `removeMember`.

3. **Sedan: Filer och bildanalys**
   - Slash eller knapp: lista filer i projekt, sök filer, radera fil (med bekräftelse).
   - Tydligt flöde för "analysera dokument/bild" (OCR/vision) om det ska erbjudas utöver nuvarande "skicka bild i chatten".

4. **Sedan: Anteckningar**
   - `/anteckning lista` / `skapa` / `uppdatera` / `radera` för projekt- och ev. personliga anteckningar (minimal variant först).

5. **Sedan: E-postintegration**
   - Sök e-post (`searchMyEmails`), visa konversation (`getConversationContext`), ev. "förbered e-post" som ger länk till webb eller preview i Discord.

6. **Senare: Rapporter, offerter, inköpslistor, automatiseringar**
   - Börja med read-only eller enkla kommandon (t.ex. lista offerter, lista inköpslistor); skapa/redigera kan länka till webb eller få enkla modaler senare.

---

## Övriga observationer

- **Ingen slash command idag** – All interaktion sker via meddelanden, knappar, select-menyer och modaler. Slash commands skulle ge tydligare paritet med AI/webb och bättre upptäckbarhet.
- **Discord-AI:** Om `/api/internal/discord-chat` exponerar samma 115 verktyg som personlig AI, kan användare redan idag "be AI:n" göra saker (t.ex. "skapa ett projekt X", "visa mina uppgifter"); gapet är då främst **upptäckbarhet och snabb åtgärd** utan att skriva i chatten.
- **Rate limit:** Max 10 AI-förfrågningar/minut – viktigt att behålla vid utbyggnad så att slash commands som anropar backend inte kringgår denna gräns på ett oönskat sätt (om de går via samma pipeline).

---

*Genererad från `01-ai-chat-functions.md`, `02-ui-server-actions.md`, `03-discord-bot-functions.md`.*
