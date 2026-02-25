/**
 * Discord Button builders for task actions, time logging, and confirmations.
 * Uses ButtonBuilder and ActionRowBuilder from discord.js v14.
 */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Create action buttons for a task.
 * Buttons: View details, Assign, Mark complete, Open in web
 */
export function createTaskButtons(
  taskId: string
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`task_view_${taskId}`)
      .setLabel("Visa detaljer")
      .setEmoji("\u{1F50D}")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`task_assign_${taskId}`)
      .setLabel("Tilldela")
      .setEmoji("\u{1F464}")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`task_complete_${taskId}`)
      .setLabel("Klar")
      .setEmoji("\u2705")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setLabel("\u00D6ppna i webb")
      .setEmoji("\u{1F310}")
      .setStyle(ButtonStyle.Link)
      .setURL(`${APP_URL}/sv/tasks/${taskId}`)
  );
}

/**
 * Create a button for logging time on a task.
 */
export function createTimeButtons(
  taskId: string
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`time_log_${taskId}`)
      .setLabel("Logga tid")
      .setEmoji("\u23F1\uFE0F")
      .setStyle(ButtonStyle.Primary)
  );
}

/**
 * Create Yes/No confirmation buttons.
 * The actionId is used to identify which action is being confirmed.
 */
export function createConfirmButtons(
  actionId: string
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_yes_${actionId}`)
      .setLabel("Ja")
      .setEmoji("\u2705")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`confirm_no_${actionId}`)
      .setLabel("Nej")
      .setEmoji("\u274C")
      .setStyle(ButtonStyle.Danger)
  );
}
