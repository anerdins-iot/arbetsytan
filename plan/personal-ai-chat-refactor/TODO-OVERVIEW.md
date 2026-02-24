# Todo-översikt – personal-ai-chat-refactor

Alla steg och vilken agent/modell som gör vad. Orchestrator (huvudagent) mergar worktree efter godkänd verifiering.

---

## Agentroller

| Roll | Modell | Uppgift |
|------|--------|--------|
| **Implementation** | Cursor auto | Implementera en fas i worktree; bara den fasen (läs PLAN.md). **Kör inte npm run build** – det gör verifieringen. |
| **Verifiering** | Cursor auto | Kontrollera att fasen uppfyller VERIFICATION.md + kör **npm run build** i web/ (ev. npm install och dummy DATABASE_URL enligt VERIFICATION.md). |
| **Orchestrator** | — | Startar agenter, mergar worktree vid PASS, **checkar alltid av**: STATUS.md (Pågår → Klar) + VERIFICATION.md (checkboxar för fasen). |

---

## Fas 1: Typer, konstanter, utils

| # | Steg | Ansvarig | Detalj |
|---|------|----------|--------|
| 1.1 | Skapa `personal-ai-chat-types.ts` | Impl agent | UploadedFile, AnalysisFileData, NoteListPanelData, PersonalAiChatProps; VoiceMode-import. |
| 1.2 | Skapa `personal-ai-chat-constants.ts` | Impl agent | ALLOWED_EXTENSIONS, MAX_FILE_SIZE, PANEL_*, LEFT_PANEL_*, CHAT_PANEL_*, STRIP_WIDTH. |
| 1.3 | Skapa `personal-ai-chat-utils.ts` | Impl agent | getChatErrorKey, formatConversationDate, formatFileSize, generateAgentActionLog. |
| 1.4 | Uppdatera `personal-ai-chat.tsx` | Impl agent | Ta bort flyttad kod, importera från nya filer. |
| 1v | Verifiera Fas 1 | Verifieringsagent | Checklista VERIFICATION.md Fas 1; npm run build i web/. |
| 1m | Merge Fas 1 + checkav | Orchestrator | Merge worktree; uppdatera STATUS.md (Fas 1 = Klar); checka av Fas 1 i VERIFICATION.md. |

---

## Fas 2: Panel resize

| # | Steg | Ansvarig | Detalj |
|---|------|----------|--------|
| 2.1 | Skapa `use-personal-ai-chat-panel-resize.ts` | Impl agent | mode → panelWidth, isResizing, handleResizeStart; localStorage; konstanter från constants. |
| 2.2 | Uppdatera `personal-ai-chat.tsx` | Impl agent | Ersätt resize-state/effekter med hook. |
| 2v | Verifiera Fas 2 | Verifieringsagent | VERIFICATION.md Fas 2; build. |
| 2m | Merge Fas 2 + checkav | Orchestrator | Merge worktree; STATUS.md Fas 2 = Klar; checka av Fas 2 i VERIFICATION.md. |

---

## Fas 3: Filuppladdning

| # | Steg | Ansvarig | Detalj |
|---|------|----------|--------|
| 3.1 | Skapa `use-chat-file-upload.ts` | Impl agent | conversationId, activeProjectIdRef, t → uploadedFiles, uploadFile, handleFileSelect, removeUploadedFile. |
| 3.2 | Skapa `chat-uploaded-files-strip.tsx` | Impl agent | Props: files, onRemove, t; thumbnails + chips. |
| 3.3 | Uppdatera `personal-ai-chat.tsx` | Impl agent | Använd hook + ChatUploadedFilesStrip; behåll drag/paste. |
| 3v | Verifiera Fas 3 | Verifieringsagent | VERIFICATION.md Fas 3; build. |
| 3m | Merge Fas 3 + checkav | Orchestrator | Merge worktree; STATUS.md Fas 3 = Klar; checka av Fas 3 i VERIFICATION.md. |

---

## Fas 4: Konversationshistorik

| # | Steg | Ansvarig | Detalj |
|---|------|----------|--------|
| 4.1 | Skapa `use-conversation-history.ts` | Impl agent | conversations, loadingHistory, historyOpen; loadConversations, loadConversation, startNewConversation (via parent callbacks). |
| 4.2 | Skapa `personal-ai-chat-history-dropdown.tsx` | Impl agent | Props: öppen, loading, lista, conversationId, onSelect, onNewConversation, t, formatDate. |
| 4.3 | Uppdatera `personal-ai-chat.tsx` | Impl agent | Använd hook + dropdown. |
| 4v | Verifiera Fas 4 | Verifieringsagent | VERIFICATION.md Fas 4; build. |
| 4m | Merge Fas 4 + checkav | Orchestrator | Merge worktree; STATUS.md Fas 4 = Klar; checka av Fas 4 i VERIFICATION.md. |

---

## Fas 5: Meddelandelista och tool-kort

| # | Steg | Ansvarig | Detalj |
|---|------|----------|--------|
| 5.1 | Skapa `personal-ai-chat-message-parts.ts` | Impl agent | groupMessageParts, getToolDedupeKey, filterDeduplicatedToolGroups. |
| 5.2 | Skapa `personal-ai-chat-tool-card.tsx` | Impl agent | Tool-part + toolCardKey + callbacks → rätt kort (email, search, file, report, delete, quote, …). |
| 5.3 | Skapa `personal-ai-chat-message-list.tsx` | Impl agent | messages, refs, briefingData, projectContext, error, callbacks; scroll, sentinel, load-more, list + ToolCard. |
| 5.4 | Uppdatera `personal-ai-chat.tsx` | Impl agent | Rendera PersonalAiChatMessageList med props. |
| 5v | Verifiera Fas 5 | Verifieringsagent | VERIFICATION.md Fas 5; build. |
| 5m | Merge Fas 5 + checkav | Orchestrator | Merge worktree; STATUS.md Fas 5 = Klar; checka av Fas 5 i VERIFICATION.md. |

---

## Fas 6: Tool-resultatpaneler

| # | Steg | Ansvarig | Detalj |
|---|------|----------|--------|
| 6.1 | Skapa `personal-ai-chat-tool-panel-content.tsx` | Impl agent | panelType + panelData + callbacks → QuotePreviewCard, SearchResultsCard, … (en källa). |
| 6.2 | Skapa `personal-ai-chat-tool-panels.tsx` | Impl agent | Docked: kolumn med header + content. Sheet: alla Sheets med ToolPanelContent. |
| 6.3 | Uppdatera `personal-ai-chat.tsx` | Impl agent | Ersätt toolPanelContent + toolResultPanels med PersonalAiChatToolPanels. |
| 6v | Verifiera Fas 6 | Verifieringsagent | VERIFICATION.md Fas 6; build. |
| 6m | Merge Fas 6 + checkav | Orchestrator | Merge worktree; STATUS.md Fas 6 = Klar; checka av Fas 6 i VERIFICATION.md. |

---

## Fas 7: Input-rad

| # | Steg | Ansvarig | Detalj |
|---|------|----------|--------|
| 7.1 | Skapa `personal-ai-chat-input.tsx` | Impl agent | Form, Textarea, fil-knapp, VoiceModeToggle, Send/Stop; props enligt plan. |
| 7.2 | Uppdatera `personal-ai-chat.tsx` | Impl agent | Ersätt formulär-JSX med PersonalAiChatInput. |
| 7v | Verifiera Fas 7 | Verifieringsagent | VERIFICATION.md Fas 7; build. |
| 7m | Merge Fas 7 + checkav | Orchestrator | Merge worktree; STATUS.md Fas 7 = Klar; checka av Fas 7 i VERIFICATION.md. |

---

## Fas 8: Header

| # | Steg | Ansvarig | Detalj |
|---|------|----------|--------|
| 8.1 | Skapa `personal-ai-chat-header.tsx` | Impl agent | Props: title, isFullscreen, onToggleFullscreen, onClose, mode. |
| 8.2 | (Valfritt) toolbar-komponent | Impl agent | Projekt + modell + Ny konversation + historik; eller behåll rad i TSX. |
| 8.3 | Uppdatera `personal-ai-chat.tsx` | Impl agent | PersonalAiChatHeader; chatBody = header + toolbar + history + list + strip + error + indicator + transcript + input. |
| 8v | Verifiera Fas 8 | Verifieringsagent | VERIFICATION.md Fas 8; build. |
| 8m | Merge Fas 8 + checkav | Orchestrator | Merge worktree; STATUS.md Fas 8 = Klar; checka av Fas 8 i VERIFICATION.md. |

---

## Fas 9: Huvudkomponent och dokumentation

| # | Steg | Ansvarig | Detalj |
|---|------|----------|--------|
| 9.1 | Trimma `personal-ai-chat.tsx` | Impl agent | Endast sammansättning + kvarvarande state/callbacks; OcrReviewDialog + RagDebugModal kvar. |
| 9.2 | Doc-svep | Doc-agent (Cursor auto) | Sök personal-ai-chat / PersonalAiChat / personalAi i AGENTS.md, AI.md, plan/*.md; uppdatera beskrivningar. |
| 9v | Verifiera Fas 9 | Verifieringsagent | VERIFICATION.md Fas 9; build; inga felaktiga doc-referenser. |
| 9m | Slutmerge + checkav | Orchestrator | Merge; STATUS.md Fas 9 = Klar; checka av Fas 9 i VERIFICATION.md; "Senast uppdaterad" i STATUS. |

---

## Sammanfattning

- **Implementation:** 9 faser × 1 Cursor auto-agent (worktree) = 9 impl-agenter.
- **Verifiering:** 9 faser × 1 Cursor auto-agent = 9 verifieringsagenter.
- **Merge:** 9 merges av orchestrator.
- **Doc:** 1 doc-agent (Fas 9.2).
- Alla agenter ska läsa `plan/personal-ai-chat-refactor/PLAN.md` (verifiering även `VERIFICATION.md`).
