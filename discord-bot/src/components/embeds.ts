/**
 * Discord Embed builders for various entities.
 * Uses EmbedBuilder from discord.js v14.
 */
import { EmbedBuilder } from "discord.js";

// Color scheme
const COLORS = {
  TASK: 0x3b82f6, // Blue
  SUCCESS: 0x22c55e, // Green
  ERROR: 0xef4444, // Red
  WARNING: 0xf59e0b, // Yellow
  PROJECT: 0x8b5cf6, // Purple
  TIME: 0x06b6d4, // Cyan
  FILE: 0x6366f1, // Indigo
} as const;

// Status emoji mapping
const STATUS_EMOJI: Record<string, string> = {
  TODO: "\u{1F534}", // Red circle
  IN_PROGRESS: "\u{1F7E1}", // Yellow circle
  DONE: "\u{1F7E2}", // Green circle
};

const PRIORITY_EMOJI: Record<string, string> = {
  LOW: "\u{1F7E2}", // Green
  MEDIUM: "\u{1F7E1}", // Yellow
  HIGH: "\u{1F7E0}", // Orange
  URGENT: "\u{1F534}", // Red
};

export interface TaskEmbedData {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  deadline?: Date | string | null;
  projectName?: string;
  assignees?: string[];
  createdBy?: string;
}

export interface ProjectEmbedData {
  id: string;
  name: string;
  description?: string | null;
  status?: string;
  taskCount?: number;
  memberCount?: number;
}

export interface TimeEntryEmbedData {
  id: string;
  description?: string | null;
  minutes: number;
  date: Date | string;
  taskTitle?: string;
  projectName?: string;
  userName?: string;
}

export interface FileEmbedData {
  id: string;
  filename: string;
  size?: number;
  projectName?: string;
  uploadedBy?: string;
  url?: string;
}

/**
 * Build an embed for a task.
 */
export function createTaskEmbed(task: TaskEmbedData): EmbedBuilder {
  const statusEmoji = STATUS_EMOJI[task.status] ?? "\u26AA";
  const priorityEmoji = PRIORITY_EMOJI[task.priority] ?? "\u26AA";

  const statusLabel =
    task.status === "TODO"
      ? "Att g\u00F6ra"
      : task.status === "IN_PROGRESS"
        ? "P\u00E5g\u00E5ende"
        : "Klar";

  const priorityLabel =
    task.priority === "LOW"
      ? "L\u00E5g"
      : task.priority === "MEDIUM"
        ? "Medium"
        : task.priority === "HIGH"
          ? "H\u00F6g"
          : "Br\u00E5dskande";

  const embed = new EmbedBuilder()
    .setColor(task.status === "DONE" ? COLORS.SUCCESS : COLORS.TASK)
    .setTitle(`\u{1F4CB} ${task.title}`)
    .addFields(
      {
        name: "Status",
        value: `${statusEmoji} ${statusLabel}`,
        inline: true,
      },
      {
        name: "Prioritet",
        value: `${priorityEmoji} ${priorityLabel}`,
        inline: true,
      }
    );

  if (task.description) {
    embed.setDescription(
      task.description.length > 200
        ? task.description.slice(0, 200) + "..."
        : task.description
    );
  }

  if (task.assignees && task.assignees.length > 0) {
    embed.addFields({
      name: "Tilldelad",
      value: task.assignees.join(", "),
      inline: true,
    });
  }

  if (task.deadline) {
    const deadlineDate =
      typeof task.deadline === "string"
        ? new Date(task.deadline)
        : task.deadline;
    embed.addFields({
      name: "Deadline",
      value: deadlineDate.toLocaleDateString("sv-SE"),
      inline: true,
    });
  }

  if (task.projectName) {
    embed.addFields({
      name: "Projekt",
      value: task.projectName,
      inline: true,
    });
  }

  if (task.createdBy) {
    embed.setFooter({ text: `Skapad av ${task.createdBy}` });
  }

  embed.setTimestamp();

  return embed;
}

/**
 * Build an embed for a project.
 */
export function createProjectEmbed(project: ProjectEmbedData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.PROJECT)
    .setTitle(`\u{1F4C1} ${project.name}`)
    .setTimestamp();

  if (project.description) {
    embed.setDescription(
      project.description.length > 300
        ? project.description.slice(0, 300) + "..."
        : project.description
    );
  }

  if (project.status) {
    const statusLabel =
      project.status === "ACTIVE"
        ? "\u{1F7E2} Aktivt"
        : project.status === "PAUSED"
          ? "\u{1F7E1} Pausat"
          : "\u2705 Klart";
    embed.addFields({ name: "Status", value: statusLabel, inline: true });
  }

  if (project.taskCount !== undefined) {
    embed.addFields({
      name: "Uppgifter",
      value: `${project.taskCount}`,
      inline: true,
    });
  }

  if (project.memberCount !== undefined) {
    embed.addFields({
      name: "Medlemmar",
      value: `${project.memberCount}`,
      inline: true,
    });
  }

  return embed;
}

/**
 * Build an embed for a time entry.
 */
export function createTimeEntryEmbed(
  entry: TimeEntryEmbedData
): EmbedBuilder {
  const hours = Math.floor(entry.minutes / 60);
  const mins = entry.minutes % 60;
  const timeStr =
    hours > 0 ? `${hours}h ${mins > 0 ? `${mins}min` : ""}` : `${mins}min`;

  const date =
    typeof entry.date === "string" ? new Date(entry.date) : entry.date;

  const embed = new EmbedBuilder()
    .setColor(COLORS.TIME)
    .setTitle(`\u23F1\uFE0F Tidsrapport`)
    .addFields(
      { name: "Tid", value: timeStr, inline: true },
      {
        name: "Datum",
        value: date.toLocaleDateString("sv-SE"),
        inline: true,
      }
    )
    .setTimestamp();

  if (entry.description) {
    embed.setDescription(entry.description);
  }

  if (entry.taskTitle) {
    embed.addFields({
      name: "Uppgift",
      value: entry.taskTitle,
      inline: true,
    });
  }

  if (entry.projectName) {
    embed.addFields({
      name: "Projekt",
      value: entry.projectName,
      inline: true,
    });
  }

  if (entry.userName) {
    embed.setFooter({ text: `Rapporterad av ${entry.userName}` });
  }

  return embed;
}

/**
 * Build an embed for an uploaded file.
 */
export function createFileEmbed(file: FileEmbedData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.FILE)
    .setTitle(`\u{1F4CE} ${file.filename}`)
    .setTimestamp();

  if (file.size !== undefined) {
    embed.addFields({
      name: "Storlek",
      value: formatBytes(file.size),
      inline: true,
    });
  }

  if (file.projectName) {
    embed.addFields({
      name: "Projekt",
      value: file.projectName,
      inline: true,
    });
  }

  if (file.uploadedBy) {
    embed.setFooter({ text: `Uppladdad av ${file.uploadedBy}` });
  }

  return embed;
}

/**
 * Build a task list embed showing multiple tasks for a project.
 */
export function createTaskListEmbed(
  projectName: string,
  tasks: TaskEmbedData[],
  currentPage: number,
  totalPages: number,
  totalCount: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.TASK)
    .setTitle(`\u{1F4CB} Uppgifter — ${projectName}`)
    .setTimestamp();

  if (tasks.length === 0) {
    embed.setDescription("Inga aktiva uppgifter i detta projekt.");
    return embed;
  }

  const lines = tasks.map((t) => {
    const statusEmoji = STATUS_EMOJI[t.status] ?? "\u26AA";
    const priorityEmoji = PRIORITY_EMOJI[t.priority] ?? "\u26AA";
    const assigneeStr =
      t.assignees && t.assignees.length > 0
        ? ` — ${t.assignees.join(", ")}`
        : "";
    const deadlineStr =
      t.deadline
        ? ` | \u{1F4C5} ${(typeof t.deadline === "string" ? new Date(t.deadline) : t.deadline).toLocaleDateString("sv-SE")}`
        : "";
    return `${statusEmoji} ${priorityEmoji} **${t.title}**${assigneeStr}${deadlineStr}`;
  });

  embed.setDescription(lines.join("\n"));
  embed.setFooter({
    text: `Sida ${currentPage + 1} av ${totalPages} — ${totalCount} uppgifter totalt`,
  });

  return embed;
}

/**
 * Build a project hub embed — persistent message with project actions.
 */
export function createProjectHubEmbed(projectName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.PROJECT)
    .setTitle(`\u{1F3E0} ${projectName}`)
    .setDescription(
      "Välkommen till projektkanalen! Använd knapparna nedan för att hantera uppgifter.\n\n" +
        "\u2795 **Skapa uppgift** — Öppna formulär för ny uppgift\n" +
        "\u{1F4CB} **Lista uppgifter** — Visa alla aktiva uppgifter"
    )
    .setFooter({ text: "ArbetsYtan — Projektledning för hantverkare" })
    .setTimestamp();
}

/**
 * Build a red error embed.
 */
export function createErrorEmbed(
  message: string,
  details?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle("\u274C Fel")
    .setDescription(message)
    .setTimestamp();

  if (details) {
    embed.addFields({ name: "Detaljer", value: details });
  }

  return embed;
}

/**
 * Build a green success embed.
 */
export function createSuccessEmbed(
  message: string,
  details?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.SUCCESS)
    .setTitle("\u2705 Klart")
    .setDescription(message)
    .setTimestamp();

  if (details) {
    embed.addFields({ name: "Detaljer", value: details });
  }

  return embed;
}

/**
 * Build an onboarding welcome embed.
 */
export function createOnboardingWelcomeEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.PROJECT)
    .setTitle("\u{1F680} V\u00E4lkommen till ArbetsYtan!")
    .setDescription(
      "Koppla dina projekt till Discord f\u00F6r att f\u00E5 notifikationer, hantera uppgifter och samarbeta direkt h\u00E4rifr\u00E5n.\n\n" +
        "**Vad h\u00E4nder n\u00E4r du k\u00F6r setup:**\n" +
        "\u2022 V\u00E4lj vilka projekt du vill koppla\n" +
        "\u2022 Discord-kanaler skapas automatiskt per projekt\n" +
        "\u2022 Varje projekt f\u00E5r: #allm\u00E4nt, #uppgifter, #filer och #aktivitet\n\n" +
        "Klicka p\u00E5 knappen nedan f\u00F6r att b\u00F6rja!"
    )
    .setFooter({ text: "ArbetsYtan \u2014 Projektledning f\u00F6r hantverkare" })
    .setTimestamp();
}

/**
 * Build an embed with instructions for project selection.
 */
export function createProjectSelectEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.PROJECT)
    .setTitle("\u{1F4C1} V\u00E4lj projekt att koppla")
    .setDescription(
      "V\u00E4lj ett eller flera projekt fr\u00E5n listan nedan. F\u00F6r varje valt projekt skapas en Discord-kategori med kanaler.\n\n" +
        "\u{1F4A1} *Du kan v\u00E4lja upp till 25 projekt \u00E5t g\u00E5ngen.*"
    )
    .setTimestamp();
}

export interface SyncConfirmProject {
  name: string;
  id: string;
}

/**
 * Build a confirmation embed before syncing.
 */
export function createSyncConfirmEmbed(
  projects: SyncConfirmProject[]
): EmbedBuilder {
  const projectList = projects.map((p) => `\u2022 **${p.name}**`).join("\n");

  return new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle("\u2753 Bekr\u00E4fta synkning")
    .setDescription(
      `Du har valt **${projects.length}** projekt att koppla till Discord:\n\n` +
        `${projectList}\n\n` +
        "F\u00F6r varje projekt skapas:\n" +
        "\u2022 En kategori med projektnamnet\n" +
        "\u2022 #allm\u00E4nt \u2014 AI-bot och allm\u00E4n diskussion\n" +
        "\u2022 #uppgifter \u2014 Uppgiftsnotifikationer\n" +
        "\u2022 #filer \u2014 Filuppladdningar\n" +
        "\u2022 #aktivitet \u2014 Anteckningar och statusuppdateringar\n\n" +
        "\u00C4r detta korrekt?"
    )
    .setTimestamp();
}

export interface SyncCompleteResult {
  projectName: string;
  channelCount: number;
  error?: string;
}

/**
 * Build a summary embed after sync is complete.
 */
export function createSyncCompleteEmbed(
  results: SyncCompleteResult[]
): EmbedBuilder {
  const successful = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);

  let description = `**${successful.length}** av **${results.length}** projekt synkades!\n\n`;

  if (successful.length > 0) {
    description += "**Lyckades:**\n";
    description += successful
      .map(
        (r) =>
          `\u2705 **${r.projectName}** \u2014 ${r.channelCount} kanaler skapade`
      )
      .join("\n");
  }

  if (failed.length > 0) {
    description += "\n\n**Misslyckades:**\n";
    description += failed
      .map((r) => `\u274C **${r.projectName}** \u2014 ${r.error}`)
      .join("\n");
  }

  return new EmbedBuilder()
    .setColor(failed.length > 0 ? COLORS.WARNING : COLORS.SUCCESS)
    .setTitle(
      failed.length === 0
        ? "\u2705 Synkning klar!"
        : "\u26A0\uFE0F Synkning delvis klar"
    )
    .setDescription(description)
    .setFooter({ text: "Kanalerna \u00E4r redo att anv\u00E4ndas!" })
    .setTimestamp();
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
