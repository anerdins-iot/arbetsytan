/**
 * InteractionCreate event handler.
 * Routes incoming interactions (buttons, select menus, modals) to the appropriate handler.
 */
import { Client, Events, MessageFlags } from "discord.js";
import { handleButton } from "../handlers/button.js";
import { handleSelectMenu } from "../handlers/select.js";
import { handleModalSubmit } from "../handlers/modal.js";
import { createGenericErrorEmbed } from "../components/error-embeds.js";

export function registerInteractionCreate(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // Handle button interactions (e.g., onboarding buttons)
      if (interaction.isButton()) {
        await handleButton(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
      }
      // Note: Slash commands are intentionally NOT supported.
      // The bot responds only to @mentions and DMs.
    } catch (error) {
      console.error("[interactionCreate] Error handling interaction:", error);

      // Try to respond with an error embed if possible
      try {
        const errorEmbed = createGenericErrorEmbed();

        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
              embeds: [errorEmbed],
              flags: MessageFlags.Ephemeral,
            });
          } else {
            await interaction.reply({
              embeds: [errorEmbed],
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      } catch {
        // Ignore errors when trying to respond with error message
      }
    }
  });
}
