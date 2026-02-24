/**
 * Grouping and deduplication of message parts for personal AI chat.
 * Used by PersonalAiChatMessageList to render text bubbles and tool cards.
 */

export type TextGroup = { type: "text"; text: string };
export type ToolGroup = { type: "tool"; part: MessagePart; index: number };
export type MessagePartGroup = TextGroup | ToolGroup;

/** Generic message part (text or tool-invocation-like from AI SDK). */
export type MessagePart =
  | { type: "text"; text: string }
  | { type: string; state?: string; output?: Record<string, unknown> };

/**
 * Group consecutive text parts into single text groups, and keep each tool part as its own group.
 * Prevents one bubble per segment when the AI sends multiple text parts.
 */
export function groupMessageParts(parts: MessagePart[]): MessagePartGroup[] {
  const groups: MessagePartGroup[] = [];
  let textAcc: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.type === "text") {
      textAcc.push((part as { text: string }).text);
    } else {
      if (textAcc.length > 0) {
        groups.push({ type: "text", text: textAcc.join("") });
        textAcc = [];
      }
      if (part.type.startsWith("tool-") && part.type !== "tool-invocation") {
        groups.push({ type: "tool", part, index: i });
      }
    }
  }
  if (textAcc.length > 0) {
    groups.push({ type: "text", text: textAcc.join("") });
  }
  return groups;
}

/**
 * Return a stable dedupe key for a tool part with output-available state, or null.
 * Used to avoid duplicate cards and "new button per keystroke" on re-renders.
 */
export function getToolDedupeKey(part: MessagePart): string | null {
  const result = (part as { output?: Record<string, unknown> }).output;
  if (!result || (part as { state?: string }).state !== "output-available") return null;

  if (result.__emailPreview) {
    const d = result as { subject?: string; recipients?: string[] };
    return `email:${d.subject ?? ""}:${(d.recipients ?? []).join(",")}`;
  }
  if (result.__searchResults && Array.isArray(result.results)) {
    const r = result.results as { fileId?: string }[];
    return `search:${r.length}-${r[0]?.fileId ?? ""}`;
  }
  if (result.__noteList) {
    const d = result.__noteList as { count: number; projectId?: string; notes?: { id?: string }[] };
    return `noteList:${d.count}:${d.projectId ?? "p"}:${d.notes?.[0]?.id ?? ""}`;
  }
  if (result.__taskList) {
    const d = result.__taskList as { count: number; projectId?: string; tasks?: { id?: string }[] };
    return `taskList:${d.count}:${d.projectId ?? ""}:${d.tasks?.[0]?.id ?? ""}`;
  }
  if (result.__fileList) {
    const d = result.__fileList as { count: number; projectId?: string; files?: { id?: string }[] };
    return `fileList:${d.count}:${d.projectId ?? ""}:${d.files?.[0]?.id ?? ""}`;
  }
  if (result.__quoteList) {
    const d = result.__quoteList as { count: number; quotes?: { id?: string }[] };
    return `quoteList:${d.count}:${d.quotes?.[0]?.id ?? ""}`;
  }
  if (result.__timeEntryList) {
    const d = result.__timeEntryList as { count?: number; entries?: unknown[] };
    return `timeEntryList:${d.count ?? (d.entries?.length ?? 0)}`;
  }
  if (result.__shoppingLists) {
    const d = result.__shoppingLists as { count?: number; lists?: { id?: string }[] };
    return `shoppingLists:${d.count ?? 0}:${d.lists?.[0]?.id ?? ""}`;
  }
  if (result.__reportPreview) {
    const d = result as { title?: string; projectId?: string };
    return `report:${d.title ?? ""}:${d.projectId ?? ""}`;
  }
  if (result.__quotePreview) {
    const d = result as { title?: string; projectId?: string };
    return `quotePreview:${d.title ?? ""}:${d.projectId ?? ""}`;
  }
  if (result.__wholesalerSearch) {
    const d = result.__wholesalerSearch as { query?: string; products?: { articleNo?: string }[] };
    const q = (d.query ?? "").trim();
    const firstId = d.products?.[0]?.articleNo ?? "";
    return `wholesaler:${q}:${firstId}`;
  }
  if (result.__deleteConfirmation) {
    const d = result as { type: string; items?: { id: string }[] };
    return `delete:${d.type}:${(d.items ?? []).map((it) => it.id).sort().join(",")}`;
  }
  return null;
}

/**
 * For assistant messages, filter tool groups so only the first of each dedupe key is kept.
 * Other roles are returned unchanged.
 */
export function filterDeduplicatedToolGroups(
  groups: MessagePartGroup[],
  role: string
): MessagePartGroup[] {
  if (role !== "assistant") return groups;

  const seenToolKeys = new Set<string>();
  return groups.filter((g) => {
    if (g.type === "text") return true;
    if (g.type === "tool") {
      const part = g.part as { state?: string };
      if (part.state !== "output-available") return false;
      const key = getToolDedupeKey(g.part);
      if (key === null) return true;
      if (seenToolKeys.has(key)) return false;
      seenToolKeys.add(key);
      return true;
    }
    return true;
  });
}
