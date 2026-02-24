# Verifiering per fas – personal-ai-chat-refactor

**Instruktion för verifierings-agent:** Läs alltid `plan/personal-ai-chat-refactor/PLAN.md` fullt ut. Verifiera ENDAST den fas som du får angiven. Rapportera PASS/FAIL och eventuella fel. Gör inga kodändringar utom om du explicit ska fixa ett fel som du rapporterar.

**Build:** Du ska köra `npm run build` i `web/` som del av verifieringen. Om build felar pga saknad miljö: kör först `npm install` (i workspace-rot eller `web/`). Om build kräver `DATABASE_URL` eller liknande, sätt en dummy (t.ex. `DATABASE_URL=postgresql://localhost:5432/dummy npm run build` i web/) så att kompilering/typkontroll går igenom; rapportera om du behövde dummy-env.

**Checkav:** Orchestrator checkar av (byter `[ ]` till `[x]`) för den fas som just blivit verifierad och mergad – varje gång, även om verifieringsagenten inte uppdaterat denna fil.

---

## Fas 1 – Typer, konstanter, utils

- [x] Finns `web/src/components/ai/personal-ai-chat-types.ts` med `UploadedFile`, `AnalysisFileData`, `NoteListPanelData`, `PersonalAiChatProps` (och nödvändiga imports t.ex. VoiceMode).
- [x] Finns `web/src/components/ai/personal-ai-chat-constants.ts` med ALLOWED_EXTENSIONS, MAX_FILE_SIZE, PANEL_WIDTH_STORAGE_KEY, LEFT_PANEL_COLLAPSED_KEY, CHAT_PANEL_COLLAPSED_KEY, DEFAULT_PANEL_WIDTH, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH, LEFT_PANEL_WIDTH, STRIP_WIDTH.
- [x] Finns `web/src/components/ai/personal-ai-chat-utils.ts` med getChatErrorKey, formatConversationDate, formatFileSize, generateAgentActionLog (samma signatur som tidigare).
- [x] `personal-ai-chat.tsx` importerar från dessa tre filer och har INGA lokala definitioner av ovanstående typer/konstanter/funktioner.
- [x] `npm run build` (i web/) passerar. Inga nya lint-fel i de berörda filerna.

---

## Fas 2 – Panel resize

- [x] Finns `web/src/hooks/use-personal-ai-chat-panel-resize.ts` som tar `mode` och returnerar `{ panelWidth, isResizing, handleResizeStart }`.
- [x] Hook använder konstanter från personal-ai-chat-constants (PANEL_WIDTH_STORAGE_KEY, MIN/MAX/DEFAULT).
- [x] `personal-ai-chat.tsx` använder hooken och har ingen kvarvarande lokal resize-state eller resize-useEffect.
- [x] Build passerar. Docked-panelen kan fortfarande resizas (manuell kontroll om möjligt).

---

## Fas 3 – Filuppladdning

- [x] Finns `web/src/hooks/use-chat-file-upload.ts` med uploadedFiles, uploadFile, handleFileSelect, removeUploadedFile, setUploadedFiles.
- [x] Finns `web/src/components/ai/chat-uploaded-files-strip.tsx` med props files, onRemove, t (och getFileIcon om det används).
- [x] Huvudkomponenten använder hooken och ChatUploadedFilesStrip; drag/paste anropar handleFileSelect. Ingen duplicerad upload-logik kvar i huvudfilen.
- [x] Build passerar. Inga nya lint-fel.

---

## Fas 4 – Konversationshistorik

- [x] Finns `web/src/hooks/use-conversation-history.ts` med conversations, loadingHistory, historyOpen, loadConversations, loadConversation, startNewConversation (eller motsvarande API som planen beskriver).
- [x] Finns `web/src/components/ai/personal-ai-chat-history-dropdown.tsx` med props enligt plan.
- [x] Huvudkomponenten använder hook + dropdown; conversationId, messages, nextCursor/hasMore styrs fortfarande från parent där det behövs.
- [x] Build passerar.

---

## Fas 5 – Meddelandelista och tool-kort

- [x] Finns `personal-ai-chat-message-parts.ts` med groupMessageParts, getToolDedupeKey, filterDeduplicatedToolGroups.
- [x] Finns `personal-ai-chat-tool-card.tsx` som renderar ett tool-part till rätt kort (email, search, file, report, delete, quote, wholesaler, quoteList, noteList, timeEntry, fileList, taskList, shoppingLists) via callbacks.
- [x] Finns `personal-ai-chat-message-list.tsx` som tar messages, refs, briefingData, projectContext, error, callbacks och renderar lista + tool-kort.
- [x] Huvudkomponenten renderar PersonalAiChatMessageList och skickar alla nödvändiga props; ingen kvarvarande duplicerad meddelande-/tool-renderingslogik i huvudfilen.
- [x] Build passerar. Inga nya lint-fel.

---

## Fas 6 – Tool-paneler

- [ ] Finns `personal-ai-chat-tool-panel-content.tsx` med en switch på panelType som renderar QuotePreviewCard, SearchResultsCard, ReportPreviewCard, QuoteList, NoteCard-grid, TimeEntryList, FileListGrid, TaskList, ShoppingListsClient.
- [ ] Finns `personal-ai-chat-tool-panels.tsx` som visar antingen docked-kolumn eller Sheet-stack och använder ToolPanelContent för innehåll.
- [ ] Huvudkomponenten använder PersonalAiChatToolPanels; ingen duplicerad tool-panel-JSX kvar.
- [ ] Build passerar.

---

## Fas 7 – Input

- [ ] Finns `personal-ai-chat-input.tsx` med form, Textarea, fil-knapp, VoiceModeToggle, Send/Stop. Props enligt plan.
- [ ] Huvudkomponenten använder PersonalAiChatInput med rätt props; ingen kvarvarande input-form-JSX.
- [ ] Build passerar.

---

## Fas 8 – Header

- [ ] Finns `personal-ai-chat-header.tsx` med title, isFullscreen, onToggleFullscreen, onClose, mode.
- [ ] Huvudkomponenten använder PersonalAiChatHeader; chatBody är uppbyggd av header, toolbar/historik, message list, files strip, error, indicator, transcript, input.
- [ ] Build passerar.

---

## Fas 9 – Huvudkomponent och dokumentation

- [ ] personal-ai-chat.tsx är trimmat till sammansättning + kvarvarande state/callbacks; OcrReviewDialog och RagDebugModal kan ligga kvar.
- [ ] AGENTS.md, AI.md och andra .md som nämner personal-ai-chat eller PersonalAiChat är uppdaterade så att beskrivningar stämmer (moduler, filstruktur).
- [ ] Build passerar. Inga referenser till "en enda stor fil" kvar där vi nu har flera moduler.
