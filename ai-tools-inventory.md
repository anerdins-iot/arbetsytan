# AI-verktyg – inventering

Alla AI-verktyg som finns i projektet. Personlig AI (chat) använder verktygen från `createPersonalTools` i `personal-tools.ts`. Fabrikerna i `shared-tools.ts` skapar projektkontext-verktyg (createTask, updateTask, searchProjectDocuments, generateExcelDocument, generatePdfDocument, generateWordDocument) och används inte direkt av någon API-route i dag – de är avsedda för projekt-AI-kontext.

## Verktygstabell

| Verktyg | Beskrivning | Fil | Parametrar |
|---------|-------------|-----|------------|
| getProjectList | Hämta listan över projekt som användaren är medlem i (id, namn, status). | personal-tools.ts | _ (valfritt, ignoreras) |
| createProject | Skapa ett nytt projekt. Kräver behörighet. Ange namn, valfritt beskrivning och adress. | personal-tools.ts | name, description?, address? |
| updateProject | Uppdatera projektinformation. Kräver projectId. Ange fält som ska ändras. | personal-tools.ts | projectId, name?, description?, status?, address? |
| archiveProject | Arkivera ett projekt. Sätter status till ARCHIVED. | personal-tools.ts | projectId, confirmArchive |
| getUserTasks | Hämta användarens uppgifter från alla projekt. Returnerar uppgifter med projekt, status, prioritet, deadline, tilldelning. | personal-tools.ts | limit? (default 30) |
| getProjectTasks | Hämta alla uppgifter i ett specifikt projekt. Kräver projectId. | personal-tools.ts | projectId, limit? (default 50) |
| createTask | Skapa en ny uppgift i ett projekt. Kräver projectId. | personal-tools.ts | projectId, title, description?, priority?, deadline? |
| updateTask | Uppdatera en uppgift i ett projekt. Kräver projectId och taskId. | personal-tools.ts | projectId, taskId, title?, description?, status?, priority?, deadline? |
| assignTask | Tilldela en uppgift till en projektmedlem. Kräver projectId, taskId, membershipId. | personal-tools.ts | projectId, taskId, membershipId |
| deleteTask | Ta bort en uppgift permanent. Kräver confirmDeletion: true. | personal-tools.ts | projectId, taskId, confirmDeletion |
| getTaskComments | Hämta alla kommentarer för en uppgift i ett projekt. | personal-tools.ts | projectId, taskId |
| createComment | Skapa en kommentar på en uppgift. | personal-tools.ts | projectId, taskId, content |
| updateComment | Uppdatera en kommentar (endast egna). | personal-tools.ts | projectId, commentId, content |
| deleteComment | Ta bort en kommentar (endast egna). | personal-tools.ts | projectId, commentId |
| getProjectTimeEntries | Hämta tidsrapporter för ett projekt. | personal-tools.ts | projectId, limit? (default 100) |
| createTimeEntry | Skapa en ny tidsrapport för en uppgift. Ange minuter eller timmar, datum. | personal-tools.ts | projectId, taskId, minutes?, hours?, date, description? |
| updateTimeEntry | Uppdatera en befintlig tidsrapport (endast egna). | personal-tools.ts | projectId, timeEntryId, taskId?, minutes?, hours?, date?, description? |
| deleteTimeEntry | Ta bort en tidsrapport (endast egna). | personal-tools.ts | projectId, timeEntryId |
| getProjectTimeSummary | Hämta sammanfattning av registrerad tid i ett projekt (total, per uppgift, per person, per vecka). | personal-tools.ts | projectId |
| exportTimeReport | Exportera tidsrapport för ett projekt som Excel eller PDF. Returnerar nedladdningslänk. | personal-tools.ts | projectId, format (excel\|pdf), fromDate?, toDate?, targetUserId? |
| exportTaskList | Exportera uppgiftslista för ett projekt som Excel. | personal-tools.ts | projectId |
| generateProjectReport | Generera en projektrapport (PDF) med AI-sammanfattning. Sparas i projektets fillista. | personal-tools.ts | projectId, reportType (weekly\|monthly\|custom), dateRange? |
| listFiles | Lista filer i ett projekt (id, namn, typ, storlek, datum). Aliased som getProjectFiles. | personal-tools.ts | projectId, limit? (default 50) |
| deleteFile | Radera en fil från ett projekt permanent. Kräver confirmDeletion: true. | personal-tools.ts | projectId, fileId, confirmDeletion |
| getPersonalFiles | Hämta användarens personliga filer (id, namn, typ, storlek, datum, ocrPreview). | personal-tools.ts | limit? (default 50) |
| searchFiles | Semantisk sökning i dokument över alla projekt + personliga filer. | personal-tools.ts | query, limit? (default 8) |
| analyzeDocument | Analysera en PDF/ritning i ett projekt med OCR. Returnerar extraherad text. | personal-tools.ts | projectId, fileId |
| analyzePersonalFile | Hämta fullständig OCR-text för en personlig fil. | personal-tools.ts | fileId |
| analyzeImage | Analysera en bild med AI-vision (Claude). Beskriver innehåll; OCR-text skickas som kontext. | personal-tools.ts | fileId, projectId?, question? |
| movePersonalFileToProject | Flytta eller kopiera en personlig fil till ett projekt. | personal-tools.ts | fileId, projectId, deleteOriginal? (default false) |
| deletePersonalFile | Radera en personlig fil permanent. | personal-tools.ts | fileId |
| listMembers | Hämta medlemmar i ett projekt (namn, e-post, membershipId). | personal-tools.ts | projectId |
| getAvailableMembers | Hämta teammedlemmar som kan läggas till i projektet. | personal-tools.ts | projectId |
| addMember | Lägg till en teammedlem i ett projekt. | personal-tools.ts | projectId, membershipId |
| removeMember | Ta bort en medlem från ett projekt. | personal-tools.ts | projectId, membershipId |
| sendInvitation | Skicka inbjudan till ny användare via e-post (endast admins). | personal-tools.ts | email, role (ADMIN\|PROJECT_MANAGER\|WORKER) |
| listInvitations | Lista skickade inbjudningar och status (ADMIN). | personal-tools.ts | _ (valfritt) |
| cancelInvitation | Avbryt en skickad inbjudan (ADMIN). | personal-tools.ts | invitationId |
| getProjectNotes | Hämta anteckningar från ett projekt. Kan filtrera på kategori. | personal-tools.ts | projectId, category?, limit? (default 20) |
| createNote | Skapa en anteckning i ett projekt. (createProjectNote) | personal-tools.ts | projectId, content, title?, category? |
| updateNote | Uppdatera en befintlig anteckning i ett projekt. (updateProjectNote) | personal-tools.ts | projectId, noteId, content?, title?, category? |
| deleteNote | Ta bort en anteckning från ett projekt. (deleteProjectNote) | personal-tools.ts | projectId, noteId |
| searchNotes | Sök bland anteckningar i ett projekt. (searchProjectNotes) | personal-tools.ts | projectId, query, limit? (default 20) |
| getPersonalNotes | Hämta personliga anteckningar (ej kopplade till projekt). | personal-tools.ts | category?, limit? (default 20) |
| createPersonalNote | Skapa en personlig anteckning. | personal-tools.ts | content, title?, category? |
| updatePersonalNote | Uppdatera en personlig anteckning. | personal-tools.ts | noteId, content?, title?, category? |
| deletePersonalNote | Ta bort en personlig anteckning. | personal-tools.ts | noteId |
| searchPersonalNotes | Sök bland personliga anteckningar. | personal-tools.ts | query, limit? (default 20) |
| createAutomation | Skapa schemalagd automation. Naturligt språk för schema (t.ex. 'imorgon kl 8', 'varje dag kl 9'). | personal-tools.ts | name, description?, schedule, actionTool, actionParams, projectId? |
| listAutomations | Lista användarens schemalagda automationer. Filtrera valfritt på projectId. | personal-tools.ts | projectId? |
| deleteAutomation | Ta bort en schemalagd automation. | personal-tools.ts | automationId |
| listEmailTemplates | Lista alla e-postmallar (sv/en) med ämnesrad och variabler (Admin). | personal-tools.ts | _ (valfritt) |
| getEmailTemplate | Hämta en specifik e-postmall med subject, HTML och variabler (Admin). | personal-tools.ts | name, locale |
| updateEmailTemplate | Uppdatera en e-postmall för tenanten (Admin). | personal-tools.ts | name, locale, subject, htmlTemplate |
| previewEmailTemplate | Förhandsgranska e-postmall med testdata (Admin). | personal-tools.ts | name, locale, testData? |
| prepareEmailToExternalRecipients | Förbered e-post till externa mottagare. Returnerar preview; användaren skickar via knapp. | personal-tools.ts | recipients[], subject, body, replyTo?, attachments? |
| prepareEmailToTeamMembers | Förbered e-post till teammedlemmar. Preview + skicka-knapp. | personal-tools.ts | memberIds[], memberEmails?, subject, body, attachments? |
| getTeamMembersForEmailTool | Hämta alla teammedlemmar som kan ta emot e-post. | personal-tools.ts | (inga) |
| getProjectsForEmailTool | Hämta projekt med medlemsantal för e-post. | personal-tools.ts | (inga) |
| getNotificationSettings | Hämta användarens notifikationsinställningar (push, e-post för uppgifter/deadline/status). | personal-tools.ts | _ (valfritt) |
| updateNotificationSettings | Uppdatera notifikationsinställningar. | personal-tools.ts | pushEnabled?, emailTaskAssigned?, emailDeadlineTomorrow?, emailProjectStatusChanged? |
| getProjectMembersForEmailTool | Hämta medlemmar i ett specifikt projekt som kan ta emot e-post. | personal-tools.ts | projectId |
| prepareEmailToProjectMembers | Förbered e-post till projektmedlemmar. Preview + skicka-knapp. | personal-tools.ts | projectId, memberIds?, subject, body, attachments? |
| listNoteCategories | Hämta alla anteckningskategorier för tenanten. | personal-tools.ts | _ (valfritt) |
| createNoteCategory | Skapa en ny anteckningskategori. Slug genereras från namn. | personal-tools.ts | name, color? |
| updateNoteCategory | Uppdatera en anteckningskategori. | personal-tools.ts | categoryId, name?, color? |
| deleteNoteCategory | Ta bort en anteckningskategori. | personal-tools.ts | categoryId |
| createTask (projekt) | Skapa uppgift i projektet (projektkontext; projectId från kontext). Fabrik i shared-tools. | shared-tools.ts | title, description?, priority?, deadline? |
| updateTask (projekt) | Uppdatera uppgift i projektet (projektkontext). Fabrik i shared-tools. | shared-tools.ts | taskId, title?, description?, status?, priority?, deadline? |
| searchProjectDocuments | Söka i projektets dokument via semantisk sökning. Fabrik i shared-tools. | shared-tools.ts | query, limit? (default 10) |
| generateExcelDocument | Generera Excel (.xlsx) och spara i projektets fillista. Fabrik i shared-tools. | shared-tools.ts | fileName, sheetName?, rows (array av array av strängar) |
| generatePdfDocument | Generera PDF och spara i projektets fillista. Fabrik i shared-tools. | shared-tools.ts | fileName, title, content |
| generateWordDocument | Generera Word (.docx) och spara i projektets fillista. Fabrik i shared-tools. | shared-tools.ts | fileName, title, paragraphs[] |

## Metadata (tool-definitions.ts)

`web/src/lib/ai/tool-definitions.ts` innehåller metadata för verktyg (namn, kategori, beskrivning, parametrar, availableIn: project/personal, schedulable). Den används för UI och schemalagda automationer (tool-executors.ts), inte för att bygga själva tool-objekten till streamText. Tool-definitions inkluderar även verktyg som **unassignTask** och **notify**, som har executors men inte finns som `tool()` i personal-tools (notify körs via tool-executors vid automationer).

## Användning

- **Personlig AI (chat):** `web/src/app/api/ai/chat/route.ts` anropar `createPersonalTools({ db, tenantId, userId })` och skickar alla verktyg till `streamText`.
- **Projekt-AI:** De fabriksskapade verktygen i `shared-tools.ts` (createTask, updateTask, searchProjectDocuments, generateExcelDocument, generatePdfDocument, generateWordDocument) är inte kopplade till någon egen projekt-chat-route i nuvarande kodbas; personlig AI får samma funktionalitet via projectId-parametrar i personal-tools.
