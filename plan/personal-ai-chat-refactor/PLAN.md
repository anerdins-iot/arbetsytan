# Plan: Refaktorering personal-ai-chat.tsx

**Mål:** Bryta ut `web/src/components/ai/personal-ai-chat.tsx` (~2763 rader) till mindre moduler utan att ändra funktionalitet. DRY, tydlig dokumentation.

**Källa:** Nuvarande fil inkl. senaste commits (collapse-knappar, dedupe, felmeddelanden, LEFT_PANEL_* / CHAT_PANEL_* / STRIP_WIDTH).

---

## Viktiga regler för agenter

1. **Implementation-agent:** Du får ENDAST implementera den fas som är angiven i din uppgift. Läs HELA denna PLAN.md en gång, sedan utför BARA din fas. Ändra inga andra faser eller filer som inte tillhör din fas.
2. **Verifierings-agent:** Du får ENDAST verifiera den fas som anges. Läs HELA PLAN.md och VERIFICATION.md. Kontrollera att implementationen matchar planen för just den fasen och att inget annat brutits.
3. **Arbetskopia:** Implementation sker i worktree. Efter godkänd verifiering gör orchestrator merge.

4. **Checkav – orchestrator:** Efter varje fas (oavsett om verifieringsagenten gör det) ska orchestrator alltid:
   - Uppdatera **STATUS.md**: sätt fasens rad till "Pågår" när impl startar, "Klar" när merge är gjord.
   - Checka av i **VERIFICATION.md**: byt `- [ ]` till `- [x]` för just den fasens punkter när verifieringen är PASS och merge är genomförd.
   - Uppdatera "Senast uppdaterad" i STATUS.md.

---

## Fas 1: Typer, konstanter och rena hjälpare

**Omfattning:** Endast dessa filer skapas/ändras. Inga andra komponenter ändras.

- **1.1** Skapa `web/src/components/ai/personal-ai-chat-types.ts`
  - Flytta: `UploadedFile`, `AnalysisFileData`, `NoteListPanelData`, `PersonalAiChatProps`.
  - Behåll export av typer som används utanför (t.ex. `NoteListPanelData`).
  - `PersonalAiChatProps` importerar `VoiceMode` från `@/components/ai/voice-mode-toggle`.

- **1.2** Skapa `web/src/components/ai/personal-ai-chat-constants.ts`
  - Flytta: `ALLOWED_EXTENSIONS`, `MAX_FILE_SIZE`, `PANEL_WIDTH_STORAGE_KEY`, `LEFT_PANEL_COLLAPSED_KEY`, `CHAT_PANEL_COLLAPSED_KEY`, `DEFAULT_PANEL_WIDTH`, `MIN_PANEL_WIDTH`, `MAX_PANEL_WIDTH`, `LEFT_PANEL_WIDTH`, `STRIP_WIDTH`.

- **1.3** Skapa `web/src/components/ai/personal-ai-chat-utils.ts`
  - Flytta: `getChatErrorKey`, `formatConversationDate`, `formatFileSize`, `generateAgentActionLog`.
  - `generateAgentActionLog` tar `t` som andra parameter (samma signatur som idag).

- **1.4** Uppdatera `personal-ai-chat.tsx`: Ta bort flyttad kod. Importera från de nya filerna. Ingen beteendeförändring.

**Filer som skapas:** `personal-ai-chat-types.ts`, `personal-ai-chat-constants.ts`, `personal-ai-chat-utils.ts`.  
**Filer som ändras:** `personal-ai-chat.tsx` (endast imports + borttagna definitioner).

---

## Fas 2: Resize och panelbredd

- **2.1** Skapa hook `web/src/hooks/use-personal-ai-chat-panel-resize.ts`
  - Input: `mode: "sheet" | "docked"`.
  - Hantera: initial bredd från localStorage (`PANEL_WIDTH_STORAGE_KEY`), `panelWidth`, `isResizing`, `handleResizeStart`, `useEffect` för mousemove/mouseup, persist till localStorage när `mode === "docked"`.
  - Använd konstanter från `personal-ai-chat-constants.ts` (MIN/MAX/DEFAULT_PANEL_WIDTH, PANEL_WIDTH_STORAGE_KEY).
  - Return: `{ panelWidth, isResizing, handleResizeStart }`.

- **2.2** I `personal-ai-chat.tsx`: Ersätt befintlig resize-state och effekter med `usePersonalAiChatPanelResize(mode)`.

**Filer som skapas:** `use-personal-ai-chat-panel-resize.ts`.  
**Filer som ändras:** `personal-ai-chat.tsx`.

---

## Fas 3: Filuppladdning (chat)

- **3.1** Skapa hook `web/src/hooks/use-chat-file-upload.ts`
  - Parametrar: `conversationId`, `activeProjectIdRef` (RefObject eller getter), `t` (för felmeddelanden).
  - State: `uploadedFiles`, `setUploadedFiles`.
  - Logik: `uploadFile` (POST `/api/ai/upload`, chatMode, conversationId, projectId), `handleFileSelect` (storlek/typ med ALLOWED_EXTENSIONS, MAX_FILE_SIZE från constants), `removeUploadedFile`.
  - Return: `{ uploadedFiles, uploadFile, handleFileSelect, removeUploadedFile, setUploadedFiles }`.

- **3.2** Skapa komponent `web/src/components/ai/chat-uploaded-files-strip.tsx`
  - Props: `files` (UploadedFile[]), `onRemove`, `t`, `getFileIcon` (eller filtyp → ikon inuti).
  - Rendera: thumbnails för bilder, chips för övriga (status, fel, uploading/analyzing). Samma UI som idag.

- **3.3** I `personal-ai-chat.tsx`: Använd hook + `<ChatUploadedFilesStrip />`. Behåll drag/paste på chatBody (anropar handleFileSelect).

**Filer som skapas:** `use-chat-file-upload.ts`, `chat-uploaded-files-strip.tsx`.  
**Filer som ändras:** `personal-ai-chat.tsx`.

---

## Fas 4: Konversationshistorik

- **4.1** Skapa hook `web/src/hooks/use-conversation-history.ts`
  - State: `conversations`, `loadingHistory`, `historyOpen`, `setHistoryOpen`.
  - Callbacks: `loadConversations` (getPersonalConversations), `loadConversation(convId)` som returnerar/sätter messages + nextCursor + hasMore (via callbacks från parent), `startNewConversation` (rensa conversationId, messages, cursor, historyOpen).
  - Hook tar/skriver inte messages direkt; parent ger setState-funktioner så att huvudkomponenten behåller conversationId, setMessages, nextCursor, hasMore, isLoadingMore, loadMoreMessages.

- **4.2** Skapa komponent `web/src/components/ai/personal-ai-chat-history-dropdown.tsx`
  - Props: öppen, loading, lista, valt conversationId, onSelect(id), onNewConversation, t, formatDate (funktion).

- **4.3** I huvudkomponenten: använd hook + dropdown. Samma beteende som idag.

**Filer som skapas:** `use-conversation-history.ts`, `personal-ai-chat-history-dropdown.tsx`.  
**Filer som ändras:** `personal-ai-chat.tsx`.

---

## Fas 5: Meddelandelista och tool-kort

- **5.1** Skapa `web/src/components/ai/personal-ai-chat-message-parts.ts`
  - Exportera: `groupMessageParts(parts)`, `getToolDedupeKey(part)`, `filterDeduplicatedToolGroups(groups, role)`. Samma algoritm som idag (gruppering text + tool, dedupe per tool-typ).

- **5.2** Skapa `web/src/components/ai/personal-ai-chat-tool-card.tsx`
  - Input: ett tool-part (output-available), `toolCardKey`, callbacks-objekt (setOpenQuoteData, setOpenSearchResults, sendMessage för report, delete-handlers, openWholesalerPanel, etc.).
  - En switch/if på result.__emailPreview, __searchResults, __fileCreated, … som idag – returnerar rätt kort. Ingen state i parent för detta; bara callbacks.

- **5.3** Skapa `web/src/components/ai/personal-ai-chat-message-list.tsx`
  - Props: messages, chatImageMap, messageDebugContext, messageModels, scrollContainerRef, sentinelRef, isLoadingMore, briefingData, projectContext, isLoadingContext, isLoadingBriefing, error, t, getChatErrorKey, samt alla callbacks för tool-kort och "open panel".
  - Innehåll: scroll-container, sentinel, load-more, briefing, project context, placeholder, messages.map med gruppering (använd 5.1), text-bubblor, för varje tool-part anropa ToolCard (5.2), bifogade bilder (user), agent action log, RAG-debug-knapp, modell-badge.

- **5.4** I huvudkomponenten: rendera `<PersonalAiChatMessageList … />`, skicka state och callbacks. Behåll scroll-to-bottom där det passar (parent eller message-list).

**Filer som skapas:** `personal-ai-chat-message-parts.ts`, `personal-ai-chat-tool-card.tsx`, `personal-ai-chat-message-list.tsx`.  
**Filer som ändras:** `personal-ai-chat.tsx`.

---

## Fas 6: Tool-resultatpaneler (Sheet + docked)

- **6.1** Skapa `web/src/components/ai/personal-ai-chat-tool-panel-content.tsx`
  - Props: `panelType`, `panelData` (union), `onClose`, t, tQuotes, tShopping, callbacks (onReportGenerate, generateQuotePdf, getNoteCategories, getShoppingLists, setOpenShoppingListsData, etc.).
  - Switch på panelType: QuotePreviewCard, SearchResultsCard, ReportPreviewCard, QuoteList, NoteCard-grid, TimeEntryList, FileListGrid, TaskList, ShoppingListsClient. En enda källa för innehåll.

- **6.2** Skapa `web/src/components/ai/personal-ai-chat-tool-panels.tsx`
  - Props: activeToolPanel (type + title), panelData, mode (sheet | docked), isDesktopToolPanel, noteListCategories, timeEntryPanelLoading, timeEntryPanelData, onClose, samt callbacks.
  - Docked: en kolumn med header + ToolPanelContent. Sheet: alla Sheet-wrapperar, innehåll = ToolPanelContent.

- **6.3** I huvudkomponenten: ersätt toolPanelContent och toolResultPanels med `<PersonalAiChatToolPanels … />`.

**Filer som skapas:** `personal-ai-chat-tool-panel-content.tsx`, `personal-ai-chat-tool-panels.tsx`.  
**Filer som ändras:** `personal-ai-chat.tsx`.

---

## Fas 7: Input-rad (textarea + röst + fil + skicka)

- **7.1** Skapa `web/src/components/ai/personal-ai-chat-input.tsx`
  - Props: inputValue, onInputChange, onSubmit, onPaste, isLoading, uploadedFiles, voiceMode, setVoiceMode, onVoiceInput, onVoiceInputManual, onPushToTalkResult, onInterimTranscript, speakRef, stopRef, isSpeakingRef, triggerConversationRecording, fileInputRef, onFileSelect, stop, t.
  - Innehåll: form, Textarea (Enter-to-submit), fil-knapp, VoiceModeToggle, Send/Stop. Ingen egen state.

- **7.2** I huvudkomponenten: ersätt formulär-JSX med `<PersonalAiChatInput … />`.

**Filer som skapas:** `personal-ai-chat-input.tsx`.  
**Filer som ändras:** `personal-ai-chat.tsx`.

---

## Fas 8: Header (och toolbar)

- **8.1** Skapa `web/src/components/ai/personal-ai-chat-header.tsx`
  - Props: title, isFullscreen, onToggleFullscreen, onClose (optional), mode.

- **8.2** Eventuellt `personal-ai-chat-toolbar.tsx`: projekt-väljare, modell, Ny konversation, historik-knapp. Eller behåll den raden i huvudkomponenten om det är kort nog.

- **8.3** I huvudkomponenten: använd PersonalAiChatHeader, sammansätt chatBody från header, toolbar, history dropdown, message list, files strip, error, project indicator, interim transcript, input.

**Filer som skapas:** `personal-ai-chat-header.tsx` (och ev. toolbar).  
**Filer som ändras:** `personal-ai-chat.tsx`.

---

## Fas 9: Huvudkomponent och dokumentation

- **9.1** `personal-ai-chat.tsx` ska bara importera och sammansätta: hooks, underkomponenter, kvarvarande state/callbacks. OcrReviewDialog och RagDebugModal kan ligga kvar i huvudfilen.

- **9.2** Dokumentationssvep: Sök i repo (AGENTS.md, AI.md, plan/*.md, docs) efter referenser till `personal-ai-chat.tsx`, `personalAi`, `PersonalAiChat`. Uppdatera så att beskrivningar stämmer (t.ex. "personlig AI-chatt består av … moduler …").

**Filer som ändras:** `personal-ai-chat.tsx`, relevanta .md-filer.

---

## Ordning och beroenden

- Fas 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9.
- Varje fas bygger på tidigare (Fas 2 använder constants från Fas 1, etc.).
- Verifiering efter varje fas innan nästa påbörjas.
