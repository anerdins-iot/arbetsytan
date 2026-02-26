/**
 * Select menu interaction handler.
 * Handles user assignment via string select menus.
 */
import type { StringSelectMenuInteraction } from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { prisma } from "../lib/prisma.js";
import {
  identifyUser,
  getTenantFromGuild,
} from "../services/user-identification.js";
import {
  createSuccessEmbed,
  createErrorEmbed,
  createSyncConfirmEmbed,
} from "../components/embeds.js";
import type { IdentifiedUser } from "../services/user-identification.js";

/**
 * Handle a select menu interaction.
 */
export async function handleSelectMenu(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  const customId = interaction.customId;

  // Identify the user
  let tenantId: string | undefined;
  if (interaction.guildId) {
    const tenant = await getTenantFromGuild(interaction.guildId);
    tenantId = tenant?.id;
  }

  let user: IdentifiedUser | null = await identifyUser(interaction.user.id, tenantId);

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

  if (customId === "select_projects_for_sync") {
    await handleProjectSelectForSync(interaction, user.tenantId);
  } else if (customId.startsWith("assign_user_")) {
    await handleAssignUser(
      interaction,
      customId.replace("assign_user_", "")
    );
  }
}

/**
 * Assign a user to a task via the select menu.
 */
async function handleAssignUser(
  interaction: StringSelectMenuInteraction,
  taskId: string
): Promise<void> {
  await interaction.deferUpdate();

  const membershipId = interaction.values[0];
  if (!membershipId) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Ingen anv\u00E4ndare vald.")],
      components: [],
    });
    return;
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true },
  });

  if (!task) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Uppgiften hittades inte.")],
      components: [],
    });
    return;
  }

  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: { user: { select: { name: true } } },
  });

  if (!membership) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Medlemmen hittades inte.")],
      components: [],
    });
    return;
  }

  // Create or ignore assignment (upsert-like via unique constraint)
  try {
    await prisma.taskAssignment.create({
      data: {
        taskId,
        membershipId,
      },
    });
  } catch (error) {
    // If unique constraint violation, assignment already exists
    const prismaError = error as { code?: string };
    if (prismaError.code === "P2002") {
      await interaction.editReply({
        embeds: [
          createSuccessEmbed(
            `${membership.user.name ?? "Anv\u00E4ndaren"} \u00E4r redan tilldelad "${task.title}".`
          ),
        ],
        components: [],
      });
      return;
    }
    throw error;
  }

  await interaction.editReply({
    embeds: [
      createSuccessEmbed(
        `${membership.user.name ?? "Anv\u00E4ndaren"} tilldelades "${task.title}"!`
      ),
    ],
    components: [],
  });
}

/**
 * Handle project selection for onboarding sync.
 * Shows a confirmation embed with confirm/cancel buttons.
 */
async function handleProjectSelectForSync(
  interaction: StringSelectMenuInteraction,
  tenantId: string
): Promise<void> {
  await interaction.deferUpdate();

  const selectedProjectIds = interaction.values;
  if (selectedProjectIds.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Inga projekt valda.")],
      components: [],
    });
    return;
  }

  const projects = await prisma.project.findMany({
    where: {
      id: { in: selectedProjectIds },
      tenantId,
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (projects.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Inga giltiga projekt hittades.")],
      components: [],
    });
    return;
  }

  const confirmEmbed = createSyncConfirmEmbed(projects);

  // Encode project IDs in the button customId (comma-separated)
  const projectIdsParam = projects.map((p) => p.id).join(",");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_sync_${projectIdsParam}`)
      .setLabel("Bekr\u00E4fta")
      .setEmoji("\u2705")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("cancel_sync")
      .setLabel("Avbryt")
      .setEmoji("\u274C")
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({
    embeds: [confirmEmbed],
    components: [row],
  });
}
