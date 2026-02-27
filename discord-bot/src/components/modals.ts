/**
 * Discord Modal builders for time logging and task creation.
 * Uses ModalBuilder and TextInputBuilder from discord.js v14.
 */
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

/**
 * Create a modal for logging time on a task.
 */
export function createTimeLogModal(taskId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`time_log_modal_${taskId}`)
    .setTitle("Logga arbetstid")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("hours")
          .setLabel("Antal timmar")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("t.ex. 2.5")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(5)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Beskrivning")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Vad gjordes?")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(500)
      )
    );
}

/**
 * Create a modal for creating a new note in a project.
 */
export function createNoteModal(projectId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`note_create_modal_${projectId}`)
    .setTitle("Skapa anteckning")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Titel")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Anteckningens titel")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(200)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("content")
          .setLabel("Innehåll")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Skriv din anteckning här...")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(2000)
      )
    );
}

/**
 * Create a modal for creating a new task in a project.
 */
export function createTaskModal(projectId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`task_create_modal_${projectId}`)
    .setTitle("Skapa uppgift")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Titel")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Uppgiftens titel")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(200)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Beskrivning")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Beskriv uppgiften (valfritt)")
          .setRequired(false)
          .setMaxLength(1000)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("deadline")
          .setLabel("Deadline (valfritt)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("YYYY-MM-DD")
          .setRequired(false)
          .setMaxLength(10)
      )
    );
}
