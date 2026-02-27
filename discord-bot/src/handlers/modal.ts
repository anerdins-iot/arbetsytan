/**
 * Modal submission handler.
 * Handles time logging and task creation modal submissions.
 */
import type { ModalSubmitInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { prisma } from "../lib/prisma.js";
import {
  identifyUser,
  getTenantFromGuild,
} from "../services/user-identification.js";
import {
  createTimeEntryEmbed,
  createTaskEmbed,
  createErrorEmbed,
  createSuccessEmbed,
} from "../components/embeds.js";
import type { IdentifiedUser } from "../services/user-identification.js";
import { createTaskButtons, createTimeButtons } from "../components/buttons.js";

/**
 * Handle a modal submission.
 */
export async function handleModalSubmit(
  interaction: ModalSubmitInteraction
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

  if (customId.startsWith("time_log_modal_")) {
    await handleTimeLogSubmit(
      interaction,
      customId.replace("time_log_modal_", ""),
      user.userId,
      user.tenantId,
      user.userName
    );
  } else if (customId.startsWith("task_create_modal_")) {
    await handleTaskCreateSubmit(
      interaction,
      customId.replace("task_create_modal_", ""),
      user.userName
    );
  } else if (customId.startsWith("note_create_modal_")) {
    await handleNoteCreateSubmit(
      interaction,
      customId.replace("note_create_modal_", ""),
      user.userId,
      user.tenantId,
      user.userName
    );
  }
}

/**
 * Handle time log modal submission — creates a TimeEntry.
 */
async function handleTimeLogSubmit(
  interaction: ModalSubmitInteraction,
  taskId: string,
  userId: string,
  tenantId: string,
  userName: string
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const hoursInput = interaction.fields.getTextInputValue("hours");
  const description = interaction.fields.getTextInputValue("description");

  // Parse hours (supports both . and , as decimal separator)
  const hours = parseFloat(hoursInput.replace(",", "."));
  if (isNaN(hours) || hours <= 0 || hours > 24) {
    await interaction.editReply({
      embeds: [
        createErrorEmbed(
          "Ogiltigt antal timmar.",
          "Ange ett tal mellan 0 och 24 (t.ex. 2.5)."
        ),
      ],
    });
    return;
  }

  const minutes = Math.round(hours * 60);

  // Find the task and its project
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { id: true, name: true } } },
  });

  if (!task) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Uppgiften hittades inte.")],
    });
    return;
  }

  const timeEntry = await prisma.timeEntry.create({
    data: {
      description,
      minutes,
      date: new Date(),
      taskId: task.id,
      projectId: task.project.id,
      userId,
      tenantId,
      entryType: "WORK",
    },
  });

  const embed = createTimeEntryEmbed({
    id: timeEntry.id,
    description,
    minutes,
    date: timeEntry.date,
    taskTitle: task.title,
    projectName: task.project.name,
    userName,
  });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle task creation modal submission — creates a Task.
 */
async function handleTaskCreateSubmit(
  interaction: ModalSubmitInteraction,
  projectId: string,
  createdBy: string
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const title = interaction.fields.getTextInputValue("title");
  const description =
    interaction.fields.getTextInputValue("description") || null;
  const deadlineInput =
    interaction.fields.getTextInputValue("deadline") || null;

  // Validate deadline format if provided
  let deadline: Date | null = null;
  if (deadlineInput) {
    deadline = new Date(deadlineInput);
    if (isNaN(deadline.getTime())) {
      await interaction.editReply({
        embeds: [
          createErrorEmbed(
            "Ogiltigt datumformat.",
            "Ange datum i formatet YYYY-MM-DD."
          ),
        ],
      });
      return;
    }
  }

  // Verify project exists
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

  const task = await prisma.task.create({
    data: {
      title,
      description,
      deadline,
      projectId: project.id,
      status: "TODO",
      priority: "MEDIUM",
    },
  });

  const embed = createTaskEmbed({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    deadline: task.deadline,
    projectName: project.name,
    createdBy,
  });

  const buttons = createTaskButtons(task.id);
  const timeButtons = createTimeButtons(task.id);

  await interaction.editReply({
    embeds: [embed],
    components: [buttons, timeButtons],
  });
}

/**
 * Handle note creation modal submission — creates a Note.
 */
async function handleNoteCreateSubmit(
  interaction: ModalSubmitInteraction,
  projectId: string,
  userId: string,
  tenantId: string,
  userName: string
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const title = interaction.fields.getTextInputValue("title");
  const content = interaction.fields.getTextInputValue("content");

  // Verify project exists
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

  const note = await prisma.note.create({
    data: {
      title,
      content,
      projectId: project.id,
      createdById: userId,
    },
  });

  await interaction.editReply({
    embeds: [
      createSuccessEmbed(
        `Anteckning "${note.title}" skapad!`,
        `Projekt: ${project.name}\nSkapad av: ${userName}`
      ),
    ],
  });
}
