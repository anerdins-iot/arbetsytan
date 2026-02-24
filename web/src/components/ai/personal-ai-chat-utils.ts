/** Map a chat error message to a specific translation key. */
export function getChatErrorKey(error: Error | undefined): string {
  if (!error) return "error";
  const msg = error.message.toLowerCase();
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("too many requests")) {
    return "errorRateLimit";
  }
  if (msg.includes("overloaded") || msg.includes("capacity") || msg.includes("503")) {
    return "errorOverloaded";
  }
  return "error";
}

/** Formatera datum för konversationshistorik */
export function formatConversationDate(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Helper function to generate a compact agent action log from tool parts.
 * Returns an array of Swedish action labels (e.g., "Skapade anteckning", "Listade 13 anteckningar").
 */
export function generateAgentActionLog(
  parts: Array<{ type: string; state?: string; output?: unknown }>,
  t: (key: string, values?: Record<string, unknown>) => string
): string[] {
  const actions: string[] = [];

  for (const part of parts) {
    const isToolPart = part.type.startsWith("tool-") && part.type !== "tool-invocation";
    if (!isToolPart || part.state !== "output-available") continue;

    const result = part.output as Record<string, unknown> | undefined;
    if (!result) continue;

    // Detect tool action based on output markers
    if (result.__noteList) {
      const noteData = result.__noteList as { count: number };
      actions.push(t("agentLog.listNotes", { count: noteData.count }));
    } else if (result.__taskList) {
      const taskData = result.__taskList as { count: number };
      actions.push(t("agentLog.listTasks", { count: taskData.count }));
    } else if (result.__searchResults) {
      actions.push(t("agentLog.searchDocuments"));
    } else if (result.__fileList) {
      const fileData = result.__fileList as { count: number };
      actions.push(t("agentLog.listFiles", { count: fileData.count }));
    } else if (result.__fileCreated) {
      actions.push(t("agentLog.createFile"));
    } else if (result.__reportPreview) {
      actions.push(t("agentLog.generateReport"));
    } else if (result.__quotePreview) {
      actions.push(t("agentLog.generateQuote"));
    } else if (result.__quoteList) {
      const quoteData = result.__quoteList as { count: number };
      actions.push(t("agentLog.listQuotes", { count: quoteData.count }));
    } else if (result.__emailPreview) {
      actions.push(t("agentLog.emailPreview"));
    } else if (result.__timeEntryList) {
      const teData = result.__timeEntryList as { count: number };
      actions.push(t("agentLog.listTimeEntries", { count: teData.count }));
    } else if (result.__wholesalerSearch) {
      actions.push(t("agentLog.wholesalerSearch"));
    } else if (result.__shoppingLists) {
      const slData = result.__shoppingLists as { count: number };
      actions.push(t("agentLog.listShoppingLists", { count: slData.count }));
    } else if (result.__deleteConfirmation) {
      const delData = result as { type: string };
      if (delData.type === "task") actions.push(t("agentLog.deleteTask"));
      else if (delData.type === "file" || delData.type === "personalFile") actions.push(t("agentLog.deleteFile"));
      else if (delData.type === "projectNote" || delData.type === "personalNote") actions.push(t("agentLog.deleteNote"));
      else if (delData.type === "timeEntry") actions.push(t("agentLog.deleteTimeEntry"));
      else if (delData.type === "automation") actions.push(t("agentLog.deleteAutomation"));
      else if (delData.type === "noteCategory") actions.push(t("agentLog.deleteNoteCategory"));
    } else if (result.message) {
      // Generic tool result with message (createNote, updateNote, createTask, updateTask, logTime, etc.)
      const msg = String(result.message).toLowerCase();
      if (msg.includes("anteckning skapad") || msg.includes("note created")) {
        actions.push(t("agentLog.createNote"));
      } else if (msg.includes("anteckning uppdaterad") || msg.includes("note updated")) {
        actions.push(t("agentLog.updateNote"));
      } else if (msg.includes("uppgift skapad") || msg.includes("task created")) {
        actions.push(t("agentLog.createTask"));
      } else if (msg.includes("uppgift uppdaterad") || msg.includes("task updated")) {
        actions.push(t("agentLog.updateTask"));
      } else if (msg.includes("tid loggad") || msg.includes("time logged")) {
        actions.push(t("agentLog.logTime"));
      } else if (msg.includes("kategori skapad") || msg.includes("category created")) {
        actions.push(t("agentLog.createNoteCategory"));
      } else if (msg.includes("kategori uppdaterad") || msg.includes("category updated")) {
        actions.push(t("agentLog.updateNoteCategory"));
      }
    }
  }

  return actions;
}
