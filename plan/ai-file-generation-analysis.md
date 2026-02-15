# Analys: AI-agent integration för filgenerering

**Datum:** 2026-02-15  
**Syfte:** Hur koppla ihop AI-agenter med filgenerering så att användaren kan säga t.ex. "Skapa en rapport över alla rumsnummer på nedervåningen" och få en genererad fil.

---

## 1. Befintlig AI-infrastruktur

### 1.1 AI SDK-användning

| Plats | Användning |
|-------|------------|
| `web/src/app/api/ai/chat/route.ts` | `streamText()` med `createPersonalTools()`, `stopWhen: stepCountIs(8)`, `convertToModelMessages`, `toUIMessageStreamResponse` |
| `web/src/lib/ai/tools/personal-tools.ts` | `tool()` + `generateText()` (för rapporttext i generateProjectReport) |
| `web/src/lib/ai/tools/shared-tools.ts` | Delade tools (createTask, searchDocuments, **generateExcelDocument**, **generatePdfDocument**, **generateWordDocument**) |
| `web/src/lib/ai/queue-file-analysis.ts` | `generateText()` för filanalys |
| `web/src/lib/ai/file-processors.ts` | `generateText()` för OCR/analys |
| `web/src/lib/ai/summarize-conversation.ts` | `generateText()` för sammanfattning |

Chatten är **personal AI** med projektkontext (valfritt `projectId`). Alla tools skapas via `createPersonalTools({ db, tenantId, userId })` och används i `streamText({ model, system, messages, tools, stopWhen: stepCountIs(8) })`.

### 1.2 Befintliga filrelaterade tools

- **exportTimeReport** — Exporterar tidsrapport Excel/PDF; returnerar `downloadUrl` (presigned) eller `error`.
- **exportTaskList** — Exporterar uppgiftslista Excel; returnerar `downloadUrl`.
- **generateProjectReport** — Hämtar tasks, timeEntries, members från DB → `generateText()` för sammanfattning → `generatePdfDocument()` → `saveGeneratedDocumentToProject()` → returnerar `{ fileId, name, message }`.

Flödet i `generateProjectReport` är redan det önskade mönstret för AI → fil:

1. Agenten anropar ett enda tool med parametrar (projectId, reportType, dateRange).
2. Tool: hämtar data via DB (tasks, timeEntries, members).
3. Tool: formaterar data för AI och anropar `generateText()` för rapporttext.
4. Tool: anropar `generatePdfDocument()` som använder `buildSimplePdf(title, content)` → `saveGeneratedDocumentToProject()`.
5. Tool returnerar `fileId`, `name`, `message` till agenten; användaren får filen i projektets fillista.

### 1.3 Filgenereringskedjan (befintlig)

```
Agent (tool call)
  → shared-tools: generatePdfDocument / generateExcelDocument / generateWordDocument
    → buildSimplePdf / ExcelJS / buildSimpleDocx  (buffer)
    → saveGeneratedDocumentToProject({ db, tenantId, projectId, userId, fileName, contentType, buffer })
      → MinIO (putObject) + db.file.create() + logActivity
```

- **save-generated-document.ts** — Sparar `Uint8Array` till MinIO, skapar `File`-rad, loggar aktivitet. Kräver `requireProject` redan utförd av anroparen.
- **simple-content-pdf.tsx** — `buildSimplePdf(title, content)` där `content` är en sträng med stycken (dubbel radbrytning).
- **simple-content-docx** — `buildSimpleDocx(title, paragraphs: string[])`.
- Excel i shared-tools — `rows: string[][]` → ett ark.

---

## 2. Tool-design för datahämtning och filgenerering

### 2.1 Nuvarande datamodell (inga rum/våningar)

Prisma-schemat har **inga** modeller för rum, våning eller byggnadsdelar. Exemplet "rapport över alla rumsnummer på nedervåningen" är alltså antingen:

- **Framtida utökning** när Room/Floor/Building finns i schemat, eller
- **Generellt mönster** där "data" är det som redan finns (projekt, uppgifter, filer, anteckningar, tidsrapporter, medlemmar).

För att kunna leverera "rapport över X" behöver agenten tools som hämtar rätt data. Idag finns redan:

| Behov | Befintligt tool | Kommentar |
|-------|------------------|-----------|
| Projektinfo | `getProjectDetail` | Namn, adress, status, etc. |
| Uppgifter | `getProjectTasks` | Lista tasks med filter |
| Tidsrapporter | `getProjectTimeEntries`, `getProjectTimeSummary` | Per projekt, datum |
| Medlemmar | `listMembers` | Projektmedlemmar |
| Filer | `listFiles`, `searchFiles` | Projektfiler, semantisk sökning |
| Anteckningar | `getProjectNotes`, `searchProjectNotes` | Projekt-/personliga anteckningar |

För ett **framtida** scenario med rum/våning (om sådana modeller läggs till):

| Tool (förslag) | Syfte |
|----------------|--------|
| `getRoomsByFloor` | Hämta rum för ett plan (projectId + floorIndex eller floorLabel) |
| `getFloors` | Lista plan/våningar för ett projekt |
| `getMaterialList` | Materiallista kopplad till projekt/rum (om modell finns) |

Dessa behöver **services** enligt AGENTS.md: först `room-service.ts` (eller liknande) med `getRoomsByFloorCore`, sedan tools som anropar dem.

### 2.2 Två arkitekturmönster för AI → fil

**Mönster A – Sammansatt tool (nuvarande för projektrapport)**  
Agenten anropar ett enda tool, t.ex. `generateReport`, som:

1. Hämtar all nödvändig data (via service/DB).
2. Formaterar innehåll (ev. med `generateText` för löpande text).
3. Bygger fil (PDF/Excel/Word) och sparar via `saveGeneratedDocumentToProject`.
4. Returnerar `{ fileId, name, message }`.

- **Fördel:** Enkel för agenten, tydlig gräns, återanvänder befintlig kedja.
- **Nackdel:** Varje ny rapporttyp kräver nytt tool (eller många parametrar).

**Mönster B – Data-tools + generiskt filverktyg**  
Agenten:

1. Anropar flera data-tools (getProjectTasks, getProjectNotes, … eller framtida getRoomsByFloor).
2. Bygger en strukturerad payload (JSON).
3. Anropar ett generiskt verktyg t.ex. `createGeneratedFile({ projectId, format, title, payload })`.

En **filgenerator-service** (ny modul) tar `payload` + `format` och:

- Tolkar `payload.type` (t.ex. `"room_list"`, `"task_list"`, `"custom_report"`).
- Genererar titel/innehåll (ev. med AI) och anropar `buildSimplePdf` / Excel / Docx.
- Sparar via `saveGeneratedDocumentToProject`.

- **Fördel:** En agent kan skapa många slags rapporter utan att vi lägger till ett nytt tool per typ.
- **Nackdel:** Kräver tydligt JSON-schema för payload och en central generator som känner till alla typer.

**Rekommendation:** Börja med **mönster A** för konkreta rapporter (som "rum på nedervåningen" när Room/Floor finns): ett tool `generateRoomListReport(projectId, floor?)` som anropar service → bygger PDF/Excel → sparar. Inför **mönster B** om antalet rapporttyper växer och man vill att agenten själv ska kunna kombinera data från flera tools till en fil.

---

## 3. Output-format: hur agenten returnerar data till filgeneratorn

### 3.1 Nuvarande beteende

- **Export-verktyg (Excel/PDF nedladdning):** Returnerar `downloadUrl` + `message`. Ingen fil sparas i projektets fillista.
- **generateProjectReport:** Returnerar `fileId`, `name`, `message`. Fil sparas i projektet; användaren ser den i fillistan.

För användarupplevelsen "jag får en fil i projektet" är det alltså **tool-retur** med `fileId` + `name` som räcker; agenten kan formulera ett kort meddelande till användaren med länk/filnamn.

### 3.2 Om agenten ska ge strukturerad data (mönster B)

Om vi inför ett generiskt `createGeneratedFile` behöver tool-input (och därmed agentens "output") vara strukturerad. Exempel på JSON-schema för en "rumlista-rapport":

```ts
// Exempel: payload för rumlista (när Room/Floor finns)
const roomListPayloadSchema = z.object({
  type: z.literal("room_list"),
  title: z.string(),
  floorLabel: z.string().optional(),
  rooms: z.array(z.object({
    roomNumber: z.string(),
    name: z.string().optional(),
    area: z.number().optional(),
  })),
});
```

Exempel på AI-response-format (det som agenten skickar in till `createGeneratedFile`):

```json
{
  "format": "pdf",
  "title": "Rumsnummer nedervåningen",
  "payload": {
    "type": "room_list",
    "floorLabel": "Nedervåningen",
    "rooms": [
      { "roomNumber": "101", "name": "Entré", "area": 12.5 },
      { "roomNumber": "102", "name": "Kontor", "area": 18 }
    ]
  }
}
```

Filgeneratorn kan då rendera en enkel tabell + titel till PDF/Excel utan att agenten skriva rå HTML/PDF.

---

## 4. Prompt-engineering för filgenereringsagenten

### 4.1 System prompt – tillägg

Befintlig system prompt (chat route) innehåller redan projektkontext, proaktiv policy och sökstrategi. För filgenerering kan följande läggas till (eller placeras i en "filgenererings"-variant):

- **Tolkning av användarönskemål**
  - Filformat: om användaren säger "Excel", "PDF", "rapport" → välj format (default PDF för rapporter).
  - Omfattning: "nedervåningen" = filtrera på våning/plan när sådan data finns; "alla uppgifter" = hela projektet.
  - Titel: härled rapporttitel från användarens fras (t.ex. "Rumsnummer nedervåningen").

- **Termer för våning/plan**
  - Nedervåning / bottenvåning / plan 0 → samma filter (floor 0 eller motsvarande).
  - Övervåning / plan 1 → plan 1.
  - Kan ligga i en kort ordlista i system prompt tills datamodellen har tydliga fält (t.ex. `floorLevel`, `floorLabel`).

- **Flöde**
  1. Förstå vad användaren vill ha (rapporttyp, format, filter).
  2. Använd tools för att hämta data (getProjectTasks, getProjectNotes, eller framtida getRoomsByFloor).
  3. Om ett sammansatt tool finns (t.ex. generateRoomListReport): anropa det med projectId + ev. floor.
  4. Om generiskt createGeneratedFile används: bygg payload från tool-svar och anropa med format + title + payload.
  5. Bekräfta för användaren med filnamn och att filen finns i projektets fillista.

### 4.2 Exempel på användarfråga och flöde

**Användare:** "Skapa en rapport över alla rumsnummer på nedervåningen."

1. Agenten tolkar: rapport, innehåll = rumsnummer, filter = nedervåningen, format = PDF (default).
2. Om **Room/Floor** finns: anropa `getRoomsByFloor(projectId, floor: "0" eller "nedervåning")` → lista rum.
3. Anropa antingen:
   - `generateRoomListReport(projectId, { floor: "nedervåningen", format: "pdf" })`, eller
   - `createGeneratedFile(projectId, { format: "pdf", title: "Rumsnummer nedervåningen", payload: { type: "room_list", floorLabel: "Nedervåningen", rooms: [...] } })`.
4. Tool returnerar `fileId`, `name`, `message`.
5. Agenten svarar: "Jag har skapat rapporten 'Rumsnummer nedervåningen' och lagt den i projektets fillista."

---

## 5. Arkitekturförslag – sammanfattning

### 5.1 Kort sikt (utan Room/Floor)

- **Utnyttja befintlig kedja:** Fler "rapport-verktyg" i stil med `generateProjectReport`, t.ex.:
  - `generateTaskListReport(projectId, format?, statusFilter?)` → Excel/PDF med uppgifter.
  - `generateNotesReport(projectId, format?)` → sammanställning av anteckningar.
- Varje sådant tool: hämtar data via befintliga services → bygger innehåll (ev. med `generateText` för inledning/sammanfattning) → `generatePdfDocument` / `generateExcelDocument` → `saveGeneratedDocumentToProject` → returnerar `fileId`, `name`, `message`.
- **Ingen ny infrastruktur** – bara fler tools som använder shared-tools + save-generated-document.

### 5.2 Med framtida rum/våning

1. **Prisma:** Modeller t.ex. `Floor`, `Room` (kopplade till Project), med fält som `floorLevel`, `label`, `roomNumber`, `name`, `area`.
2. **Service:** `room-service.ts` med `getRoomsByFloorCore(projectId, floorLevel eller floorLabel)`.
3. **Tool:** `getRoomsByFloor(projectId, floor?)` som anropar service (enligt AGENTS.md: läs via service).
4. **Rapport-tool:** `generateRoomListReport(projectId, floor?, format?)` som anropar `getRoomsByFloorCore` (eller getRoomsByFloor-tool är onödigt om rapport-tool anropar service direkt), bygger PDF/Excel med rumlista, sparar via `generatePdfDocument`/`generateExcelDocument` + `saveGeneratedDocumentToProject`.
5. **Prompt:** Kort ordlista "nedervåning" → plan 0, "övervåning" → plan 1 i system prompt så att agenten skickar rätt `floor` till tool.

### 5.3 Generiskt filverktyg (mönster B, valfritt)

- **Tool:** `createGeneratedFile(projectId, format, title, payload)` med Zod-schema för `payload` (union av `room_list`, `task_list`, `custom_report`, …).
- **Modul:** `web/src/lib/ai/file-generator.ts` (eller `report-payloads.ts`):
  - Tar `payload` + `format`.
  - Switch på `payload.type` → bygger titel + innehåll (sträng/paragrafer/rader).
  - Anropar `buildSimplePdf` / Excel / Docx och sedan `saveGeneratedDocumentToProject`.
- Agenten anropar först data-tools, bygger `payload` från svaren och anropar `createGeneratedFile`. System prompt måste beskriva tillåtna payload-typer och format.

---

## 6. Tool-definitioner (TypeScript) – förslag

### 6.1 Befintligt mönster (generateProjectReport-liknande)

Ett nytt tool för "uppgiftslista som rapport" (utanför personal-tools, bara som exempel på form):

```ts
// I personal-tools eller som delat verktyg
const generateTaskListReport = tool({
  description:
    "Generera en rapport (PDF eller Excel) med projektets uppgifter. Kan filtrera på status.",
  inputSchema: toolInputSchema(z.object({
    projectId: z.string(),
    format: z.enum(["pdf", "excel"]).default("pdf"),
    statusFilter: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  })),
  execute: async ({ projectId: pid, format, statusFilter }) => {
    await requireProject(tenantId, pid, userId);
    const tasks = await getProjectTasksCore(...);
    // ... filtrera statusFilter, bygg titel + innehåll
    if (format === "pdf") {
      const result = await generatePdfDocument({ db, tenantId, projectId: pid, userId, fileName, title, content });
      return result;
    }
    const result = await generateExcelDocument({ db, tenantId, projectId: pid, userId, fileName, sheetName, rows });
    return result;
  },
});
```

### 6.2 Framtida getRoomsByFloor (när modell finns)

```ts
// Kräver room-service.ts med getRoomsByFloorCore
const getRoomsByFloor = tool({
  description: "Hämta alla rum på en angiven våning/plan. Använd floorLevel 0 för nedervåning, 1 för övervåning, eller floorLabel t.ex. 'nedervåningen'.",
  inputSchema: toolInputSchema(z.object({
    projectId: z.string(),
    floorLevel: z.number().int().min(0).optional(),
    floorLabel: z.string().optional(),
  })),
  execute: async ({ projectId: pid, floorLevel, floorLabel }) => {
    await requireProject(tenantId, pid, userId);
    const rooms = await getRoomsByFloorCore({ tenantId, projectId: pid }, { floorLevel, floorLabel });
    return { rooms: rooms.map(r => ({ id: r.id, roomNumber: r.roomNumber, name: r.name, area: r.area })) };
  },
});
```

### 6.3 Generiskt createGeneratedFile (mönster B)

```ts
const createGeneratedFile = tool({
  description:
    "Skapa en fil i projektets fillista från strukturerad data. Använd efter att du hämtat data med andra verktyg.",
  inputSchema: toolInputSchema(z.object({
    projectId: z.string(),
    format: z.enum(["pdf", "excel", "docx"]),
    title: z.string(),
    payload: z.discriminatedUnion("type", [
      z.object({ type: z.literal("room_list"), floorLabel: z.string().optional(), rooms: z.array(z.object({
        roomNumber: z.string(), name: z.string().optional(), area: z.number().optional(),
      })) }),
      z.object({ type: z.literal("task_list"), tasks: z.array(z.object({
        title: z.string(), status: z.string(), priority: z.string().optional(),
      })) }),
      // fler typer ...
    ]),
  })),
  execute: async ({ projectId: pid, format, title, payload }) => {
    await requireProject(tenantId, pid, userId);
    const result = await buildAndSaveFromPayload({ db, tenantId, projectId: pid, userId, format, title, payload });
    return result; // { fileId, name, message } | { error }
  },
});
```

`buildAndSaveFromPayload` skulle ligga i en ny modul (t.ex. `file-generator.ts`) och anropa befintliga `buildSimplePdf` / `generateExcelDocument` / `generateWordDocument` med genererat innehåll från `payload`.

---

## 7. Integration med befintlig AI-kod

- **Chat route:** Ingen ändring för att bara lägga till fler tools. Nya tools läggs i `createPersonalTools()` i `personal-tools.ts` (eller som delade verktyg som personal-tools importerar).
- **Personal tools:** Exportera de nya tools (generateTaskListReport, getRoomsByFloor, createGeneratedFile) i samma objekt som idag så att `streamText` får dem automatiskt.
- **System prompt:** Utöka med ett stycke om filgenerering och (vid behov) våningsordlista, enligt avsnitt 4.
- **Services:** Enligt AGENTS.md ska alla läsoperationer gå via services. Nya dataverktyg (t.ex. getRoomsByFloor) ska anropa `getRoomsByFloorCore` i `room-service.ts`; skriv (spara fil) sker redan via `saveGeneratedDocumentToProject` som anropas från tools/actions.

---

## 8. Exempel på AI-response-format (för filgeneratorn)

Om agenten använder mönster B och anropar `createGeneratedFile` med följande input (efter att ha hämtat rum via getRoomsByFloor):

```json
{
  "projectId": "cmlmey73b00071fo435f077if",
  "format": "pdf",
  "title": "Rumsnummer nedervåningen",
  "payload": {
    "type": "room_list",
    "floorLabel": "Nedervåningen",
    "rooms": [
      { "roomNumber": "101", "name": "Entré", "area": 12.5 },
      { "roomNumber": "102", "name": "Kontor", "area": 18 },
      { "roomNumber": "103", "name": null, "area": 8 }
    ]
  }
}
```

Filgeneratorn (backend) tolkar `payload.type`, bygger en titelrad + tabell (roomNumber, name, area), anropar `buildSimplePdf(title, content)` med genererad `content`, och sparar via `saveGeneratedDocumentToProject`. Tool returnerar sedan `{ fileId, name, message }` till agenten.

---

**Slutsats:** Befintlig infrastruktur (streamText, personal tools, generatePdfDocument/Excel/Word, saveGeneratedDocumentToProject) räcker för att koppla AI till filgenerering. Kort sikt: fler sammansatta rapport-tools i samma stil som generateProjectReport. Längre sikt: vid behov rum/våning-modeller + room-service + getRoomsByFloor + generateRoomListReport, och eventuellt generiskt createGeneratedFile med strukturerad payload för att minska antalet specifika tools.
