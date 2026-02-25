/**
 * InteractionCreate event handler.
 * Routes incoming interactions (buttons, select menus, modals) to the appropriate handler.
 */
import { Client, Events } from "discord.js";
import { handleButton } from "../handlers/button.js";
import { handleSelectMenu } from "../handlers/select.js";
import { handleModalSubmit } from "../handlers/modal.js";

export function registerInteractionCreate(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isButton()) {
        await handleButton(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
      }
    } catch (error) {
      console.error("[interactionCreate] Error handling interaction:", error);

      // Try to respond with an error message if possible
      try {
        const errorMessage =
          "\u274C Ett fel uppstod. F\u00F6rs\u00F6k igen senare.";

        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
              content: errorMessage,
              ephemeral: true,
            });
          } else {
            await interaction.reply({
              content: errorMessage,
              ephemeral: true,
            });
          }
        }
      } catch {
        // Ignore errors when trying to respond with error message
      }
    }
  });
}
