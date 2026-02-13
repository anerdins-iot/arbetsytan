/**
 * Pure formatter for activity log metadata. Safe to use in client components
 * (no server/db dependencies). Entity/action types match ACTIVITY_ENTITIES / ACTIVITY_ACTIONS.
 */
export type ActivityEntity =
  | "task"
  | "project"
  | "file"
  | "member"
  | "comment"
  | "note"
  | "timeEntry";
export type ActivityAction =
  | "created"
  | "updated"
  | "deleted"
  | "completed"
  | "assigned"
  | "uploaded"
  | "statusChanged"
  | "added"
  | "removed";

const LABELS = {
  sv: {
    file: "Fil",
    size: "Storlek",
    type: "Typ",
    name: "Namn",
    status: "Status",
    title: "Titel",
    priority: "Prioritet",
    previousStatus: "Föregående status",
    newStatus: "Ny status",
    minutes: "Minuter",
    changes: "Ändringar",
  },
  en: {
    file: "File",
    size: "Size",
    type: "Type",
    name: "Name",
    status: "Status",
    title: "Title",
    priority: "Priority",
    previousStatus: "Previous status",
    newStatus: "New status",
    minutes: "Minutes",
    changes: "Changes",
  },
} as const;

const PROJECT_STATUS: Record<string, { sv: string; en: string }> = {
  PLANNING: { sv: "Planering", en: "Planning" },
  ACTIVE: { sv: "Aktiv", en: "Active" },
  PAUSED: { sv: "Pausad", en: "Paused" },
  COMPLETED: { sv: "Slutfört", en: "Completed" },
  ARCHIVED: { sv: "Arkiverad", en: "Archived" },
};

const TASK_STATUS: Record<string, { sv: string; en: string }> = {
  TODO: { sv: "Att göra", en: "To do" },
  IN_PROGRESS: { sv: "Pågår", en: "In progress" },
  DONE: { sv: "Klar", en: "Done" },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFileType(mime: string): string {
  if (!mime || typeof mime !== "string") return "";
  const part = mime.split("/").pop()?.toUpperCase() ?? "";
  if (part === "PDF") return "PDF";
  if (part === "JPEG" || part === "JPG") return "JPEG";
  if (part === "PNG") return "PNG";
  if (part === "GIF") return "GIF";
  if (part === "WEBP") return "WebP";
  if (part === "PLAIN") return "Text";
  return part || mime;
}

type Locale = "sv" | "en";

/**
 * Formats activity log metadata into readable text for display.
 * Handles file uploads, project/task status, and generic key-value pairs.
 */
export function formatActivityMetadata(
  metadata: unknown,
  options: { entity?: ActivityEntity; action?: ActivityAction; locale?: string } = {}
): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const obj = metadata as Record<string, unknown>;
  const locale: Locale = options.locale === "sv" ? "sv" : "en";
  const L = LABELS[locale];

  // File (uploaded, deleted)
  if (options.entity === "file" && ("fileName" in obj || "fileSize" in obj || "fileType" in obj)) {
    const parts: string[] = [];
    if (obj.fileName != null && String(obj.fileName).trim()) {
      parts.push(`${L.file}: ${String(obj.fileName)}`);
    }
    if (typeof obj.fileSize === "number") {
      parts.push(`${L.size}: ${formatFileSize(obj.fileSize)}`);
    }
    if (obj.fileType != null && String(obj.fileType).trim()) {
      const human = formatFileType(String(obj.fileType));
      if (human) parts.push(`${L.type}: ${human}`);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }

  // Project (created, updated, statusChanged)
  if (options.entity === "project") {
    const parts: string[] = [];
    if (obj.name != null && String(obj.name).trim()) {
      parts.push(`${L.name}: ${String(obj.name)}`);
    }
    const statusKeys = ["status", "newStatus"] as const;
    for (const key of statusKeys) {
      const v = obj[key];
      if (v != null && String(v).trim()) {
        const label = key === "status" ? L.status : L.newStatus;
        const translated = PROJECT_STATUS[String(v)]?.[locale] ?? String(v);
        parts.push(`${label}: ${translated}`);
      }
    }
    if (obj.previousStatus != null && String(obj.previousStatus).trim()) {
      const translated =
        PROJECT_STATUS[String(obj.previousStatus)]?.[locale] ?? String(obj.previousStatus);
      parts.push(`${L.previousStatus}: ${translated}`);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }

  // Task (created, updated, deleted, completed, assigned)
  if (options.entity === "task") {
    const parts: string[] = [];
    if (obj.title != null && String(obj.title).trim()) {
      parts.push(`${L.title}: ${String(obj.title)}`);
    }
    const statusKeys = ["status", "newStatus"] as const;
    for (const key of statusKeys) {
      const v = obj[key];
      if (v != null && String(v).trim()) {
        const label = key === "status" ? L.status : L.newStatus;
        const translated = TASK_STATUS[String(v)]?.[locale] ?? String(v);
        parts.push(`${label}: ${translated}`);
      }
    }
    if (obj.previousStatus != null && String(obj.previousStatus).trim()) {
      const translated =
        TASK_STATUS[String(obj.previousStatus)]?.[locale] ?? String(obj.previousStatus);
      parts.push(`${L.previousStatus}: ${translated}`);
    }
    if (obj.priority != null && String(obj.priority).trim()) {
      parts.push(`${L.priority}: ${String(obj.priority)}`);
    }
    if (typeof obj.changes === "object" && obj.changes !== null) {
      const entries = Object.entries(obj.changes as Record<string, unknown>)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}: ${String(v)}`);
      if (entries.length > 0) {
        parts.push(`${L.changes}: ${entries.join(", ")}`);
      }
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }

  // Note
  if (options.entity === "note" && obj.title != null && String(obj.title).trim()) {
    return `${L.title}: ${String(obj.title)}`;
  }

  // Time entry
  if (options.entity === "timeEntry" && typeof obj.minutes === "number") {
    return `${L.minutes}: ${obj.minutes}`;
  }

  // Member: often only IDs; show minimal or skip
  if (options.entity === "member") {
    return null;
  }

  // Comment: taskId/source – optional short line
  if (options.entity === "comment") {
    return null;
  }

  // Generic: key-value pairs, skip internal keys
  const skip = new Set(["source", "taskId", "membershipId", "memberUserId"]);
  const entries = Object.entries(obj)
    .filter(([k, v]) => !skip.has(k) && v != null && v !== "")
    .map(([k, v]) => {
      const key = k.charAt(0).toUpperCase() + k.slice(1);
      return `${key}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
    });
  return entries.length > 0 ? entries.join(" · ") : null;
}
