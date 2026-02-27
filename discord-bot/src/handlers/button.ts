/**
 * Button interaction handler.
 * Routes button clicks to the appropriate handler based on customId prefix.
 */
import type { ButtonInteraction } from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { prisma } from "../lib/prisma.js";
import {
  identifyUser,
  getTenantFromGuild,
} from "../services/user-identification.js";
import {
  createTaskEmbed,
  createTaskListEmbed,
  createFileListEmbed,
  createSuccessEmbed,
  createErrorEmbed,
  createProjectSelectEmbed,
  createSyncConfirmEmbed,
  createSyncCompleteEmbed,
} from "../components/embeds.js";
import type { SyncResult } from "../services/channel-sync.js";
import { syncProjectsToDiscord } from "../services/channel-sync.js";
import type { IdentifiedUser } from "../services/user-identification.js";
import {
  createTaskButtons,
  createTimeButtons,
  createTaskListPaginationButtons,
} from "../components/buttons.js";
import { createTimeLogModal, createTaskModal, createNoteModal } from "../components/modals.js";

/**
 * Handle a button interaction.
 */
export async function handleButton(
  interaction: ButtonInteraction
): Promise<void> {
  const customId = interaction.customId;

  // Identify the user
  let tenantId: string | undefined;
  if (interaction.guildId) {
    const tenant = await getTenantFromGuild(interaction.guildId);
    tenantId = tenant?.id;
  }

  let user = await identifyUser(interaction.user.id, tenantId);

  // Allow guest users for testing (same logic as messageCreate)
  if (!user) {
    if (tenantId) {
      user = {
        userId: `guest-${interaction.user.id}`,
        tenantId: tenantId,
        userName: interaction.user.displayName || interaction.user.username,
        userRole: "GUEST",
        discordUserId: interaction.user.id,
      };
    } else {
      user = {
        userId: `guest-${interaction.user.id}`,
        tenantId: "seed-tenant-1",
        userName: interaction.user.displayName || interaction.user.username,
        userRole: "GUEST",
        discordUserId: interaction.user.id,
      };
    }
  }

  if (customId.startsWith("file_list_")) {
    await handleFileList(interaction, customId.replace("file_list_", ""));
  } else if (customId.startsWith("task_list_")) {
    // task_list_<projectId>_page_<n>
    await handleTaskList(interaction, customId);
  } else if (customId.startsWith("task_pin_")) {
    await handleTaskPin(interaction, customId.replace("task_pin_", ""));
  } else if (customId.startsWith("task_view_")) {
    await handleTaskView(interaction, customId.replace("task_view_", ""));
  } else if (customId.startsWith("task_complete_")) {
    await handleTaskComplete(
      interaction,
      customId.replace("task_complete_", ""),
      user.userId
    );
  } else if (customId.startsWith("task_assign_")) {
    await handleTaskAssign(
      interaction,
      customId.replace("task_assign_", ""),
      user.tenantId
    );
  } else if (customId.startsWith("time_log_")) {
    await handleTimeLog(interaction, customId.replace("time_log_", ""));
  } else if (customId.startsWith("task_create_")) {
    await handleTaskCreate(interaction, customId.replace("task_create_", ""));
  } else if (customId.startsWith("note_create_")) {
    await handleNoteCreate(interaction, customId.replace("note_create_", ""));
  } else if (customId === "start_onboarding") {
    await handleStartOnboarding(interaction, user.tenantId);
  } else if (customId.startsWith("confirm_sync_")) {
    await handleConfirmSync(interaction, customId, user.tenantId);
  } else if (customId === "cancel_sync") {
    await handleCancelSync(interaction);
  } else if (customId.startsWith("confirm_yes_")) {
    await interaction.update({
      content: "\u2705 Bekr\u00E4ftat.",
      components: [],
    });
  } else if (customId.startsWith("confirm_no_")) {
    await interaction.update({
      content: "\u274C Avbrutet.",
      components: [],
    });
  }
}

/**
 * Show task details in an ephemeral embed.
 */
async function handleTaskView(
  interaction: ButtonInteraction,
  taskId: string
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { name: true } },
      assignments: {
        include: {
          membership: {
            include: { user: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!task) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Uppgiften hittades inte.")],
    });
    return;
  }

  const assignees = task.assignments.map(
    (a) => a.membership.user.name ?? "Ok\u00E4nd"
  );

  const embed = createTaskEmbed({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    deadline: task.deadline,
    projectName: task.project.name,
    assignees,
  });

  const buttons = createTaskButtons(task.id);
  const timeButtons = createTimeButtons(task.id);

  await interaction.editReply({
    embeds: [embed],
    components: [buttons, timeButtons],
  });
}

/**
 * Mark a task as complete.
 */
async function handleTaskComplete(
  interaction: ButtonInteraction,
  taskId: string,
  userId: string
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, status: true },
  });

  if (!task) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Uppgiften hittades inte.")],
    });
    return;
  }

  if (task.status === "DONE") {
    await interaction.editReply({
      embeds: [
        createSuccessEmbed(
          `Uppgiften "${task.title}" \u00E4r redan markerad som klar.`
        ),
      ],
    });
    return;
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "DONE" },
  });

  await interaction.editReply({
    embeds: [
      createSuccessEmbed(
        `Uppgiften "${task.title}" markerades som klar!`
      ),
    ],
  });
}

/**
 * Show a select menu for assigning a user to a task.
 */
async function handleTaskAssign(
  interaction: ButtonInteraction,
  taskId: string,
  tenantId: string
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, title: true },
  });

  if (!task) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Uppgiften hittades inte.")],
    });
    return;
  }

  // Get project members for the select menu
  const projectMembers = await prisma.projectMember.findMany({
    where: { projectId: task.projectId },
    include: {
      membership: {
        include: { user: { select: { name: true, id: true } } },
      },
    },
  });

  if (projectMembers.length === 0) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed("Inga projektmedlemmar hittades att tilldela."),
      ],
    });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`assign_user_${taskId}`)
    .setPlaceholder("V\u00E4lj person att tilldela")
    .addOptions(
      projectMembers.map((pm) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(pm.membership.user.name ?? "Ok\u00E4nd")
          .setValue(pm.membershipId)
          .setDescription(pm.membership.role)
      )
    );

  const row =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  await interaction.editReply({
    content: `V\u00E4lj vem som ska tilldelas "${task.title}":`,
    components: [row],
  });
}

/**
 * Show the time logging modal.
 */
async function handleTimeLog(
  interaction: ButtonInteraction,
  taskId: string
): Promise<void> {
  const modal = createTimeLogModal(taskId);
  await interaction.showModal(modal);
}

/**
 * Show the task creation modal for a project.
 */
async function handleTaskCreate(
  interaction: ButtonInteraction,
  projectId: string
): Promise<void> {
  const modal = createTaskModal(projectId);
  await interaction.showModal(modal);
}

/**
 * Show the note creation modal for a project.
 */
async function handleNoteCreate(
  interaction: ButtonInteraction,
  projectId: string
): Promise<void> {
  const modal = createNoteModal(projectId);
  await interaction.showModal(modal);
}

/**
 * Start the onboarding wizard: fetch tenant projects and show a select menu.
 */
async function handleStartOnboarding(
  interaction: ButtonInteraction,
  tenantId: string
): Promise<void> {
  await interaction.deferUpdate();

  const projects = await prisma.project.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 25,
  });

  if (projects.length === 0) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "Inga aktiva projekt hittades.",
          "Skapa projekt i ArbetsYtan först."
        ),
      ],
      components: [],
    });
    return;
  }

  const selectEmbed = createProjectSelectEmbed();

  const select = new StringSelectMenuBuilder()
    .setCustomId("select_projects_for_sync")
    .setPlaceholder("V\u00E4lj projekt att koppla...")
    .setMinValues(1)
    .setMaxValues(Math.min(projects.length, 25))
    .addOptions(
      projects.map((p) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(p.name.slice(0, 100))
          .setValue(p.id)
          .setDescription(`Projekt-ID: ${p.id.slice(0, 50)}`)
      )
    );

  const row =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  await interaction.editReply({
    embeds: [selectEmbed],
    components: [row],
  });
}

/**
 * Confirm and execute project sync after user selected projects.
 * The customId encodes selected project IDs: confirm_sync_id1,id2,id3
 */
async function handleConfirmSync(
  interaction: ButtonInteraction,
  customId: string,
  tenantId: string
): Promise<void> {
  await interaction.deferUpdate();

  const projectIdsStr = customId.replace("confirm_sync_", "");
  const projectIds = projectIdsStr.split(",").filter(Boolean);

  if (projectIds.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Inga projekt att synka.")],
      components: [],
    });
    return;
  }

  await interaction.editReply({
    embeds: [
      createSuccessEmbed(
        "\u23F3 Synkar kanaler... Detta kan ta en stund.",
        `${projectIds.length} projekt bearbetas.`
      ),
    ],
    components: [],
  });

  const client = interaction.client;
  let results: SyncResult[] = [];

  try {
    results = await syncProjectsToDiscord(client, {
      tenantId,
      projectIds,
      requestedBy: interaction.user.id,
    });
  } catch (err) {
    console.error("[button] Sync failed:", err);
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "Synkningen misslyckades.",
          String(err)
        ),
      ],
      components: [],
    });
    return;
  }

  const syncResults = results.map((r) => ({
    projectName: r.projectName,
    channelCount: r.channels.length,
    error: r.error,
  }));

  await interaction.editReply({
    embeds: [createSyncCompleteEmbed(syncResults)],
    components: [],
  });
}

/**
 * Cancel the onboarding sync wizard.
 */
async function handleCancelSync(
  interaction: ButtonInteraction
): Promise<void> {
  await interaction.update({
    embeds: [
      createSuccessEmbed(
        "Synkning avbruten.",
        "Du kan starta synkningen igen via AI-chatten eller Webb-UI:t."
      ),
    ],
    components: [],
  });
}

/** Items per page in task list */
const TASK_LIST_PAGE_SIZE = 8;

/**
 * List tasks for a project with pagination.
 * customId format: task_list_<projectId>_page_<pageNumber>
 */
async function handleTaskList(
  interaction: ButtonInteraction,
  customId: string
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Parse customId: task_list_<projectId>_page_<n>
  const match = customId.match(/^task_list_(.+)_page_(\d+)$/);
  if (!match) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Ogiltigt kommando.")],
    });
    return;
  }

  const projectId = match[1];
  const page = parseInt(match[2], 10);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });

  if (!project) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Projektet hittades inte.")],
    });
    return;
  }

  // Count total active tasks
  const totalCount = await prisma.task.count({
    where: { projectId, status: { not: "DONE" } },
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / TASK_LIST_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  // Fetch tasks for this page
  const tasks = await prisma.task.findMany({
    where: { projectId, status: { not: "DONE" } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    skip: safePage * TASK_LIST_PAGE_SIZE,
    take: TASK_LIST_PAGE_SIZE,
    include: {
      assignments: {
        include: {
          membership: {
            include: { user: { select: { name: true } } },
          },
        },
      },
    },
  });

  const taskData = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline,
    projectName: project.name,
    assignees: t.assignments.map((a) => a.membership.user.name ?? "Okänd"),
  }));

  const embed = createTaskListEmbed(
    project.name,
    taskData,
    safePage,
    totalPages,
    totalCount
  );

  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  // Add pagination if more than one page
  if (totalPages > 1) {
    const paginationRow = createTaskListPaginationButtons(
      projectId,
      safePage,
      totalPages
    );
    if (paginationRow.components.length > 0) {
      components.push(paginationRow);
    }
  }

  await interaction.editReply({
    embeds: [embed],
    components,
  });
}

/**
 * Pin a task — send a persistent (non-ephemeral) task embed in the channel.
 */
async function handleTaskPin(
  interaction: ButtonInteraction,
  taskId: string
): Promise<void> {
  await interaction.deferReply(); // Non-ephemeral so it stays visible

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { name: true } },
      assignments: {
        include: {
          membership: {
            include: { user: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!task) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Uppgiften hittades inte.")],
    });
    return;
  }

  const assignees = task.assignments.map(
    (a) => a.membership.user.name ?? "Okänd"
  );

  const embed = createTaskEmbed({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    deadline: task.deadline,
    projectName: task.project.name,
    assignees,
  });
  embed.setFooter({ text: "\u{1F4CC} Fäst uppgift" });

  const buttons = createTaskButtons(task.id);
  const timeButtons = createTimeButtons(task.id);

  const reply = await interaction.editReply({
    embeds: [embed],
    components: [buttons, timeButtons],
  });

  // Try to pin the message in the channel
  try {
    const message = await interaction.channel?.messages.fetch(reply.id);
    if (message && message.pinnable) {
      await message.pin();
    }
  } catch {
    // Pin may fail if bot lacks permission — the message stays visible regardless
    console.warn("[button] Could not pin task message, missing permission");
  }
}

/**
 * Show a list of recent files for a project.
 */
async function handleFileList(
  interaction: ButtonInteraction,
  projectId: string
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });

  if (!project) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Projektet hittades inte.")],
    });
    return;
  }

  const files = await prisma.file.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      name: true,
      size: true,
      createdAt: true,
    },
  });

  const embed = createFileListEmbed(files, project.name);

  await interaction.editReply({
    embeds: [embed],
  });
}
