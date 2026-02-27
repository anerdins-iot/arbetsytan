/**
 * Button interaction handler.
 * Routes button clicks to the appropriate handler based on customId prefix.
 */
import type { ButtonInteraction } from "discord.js";
import {
  ActionRowBuilder,
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
  createSuccessEmbed,
  createErrorEmbed,
  createProjectSelectEmbed,
  createSyncConfirmEmbed,
  createSyncCompleteEmbed,
} from "../components/embeds.js";
import type { SyncResult } from "../services/channel-sync.js";
import { syncProjectsToDiscord } from "../services/channel-sync.js";
import type { IdentifiedUser } from "../services/user-identification.js";
import { createTaskButtons, createTimeButtons } from "../components/buttons.js";
import { createTimeLogModal, createTaskModal } from "../components/modals.js";

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

  if (customId.startsWith("task_view_")) {
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
