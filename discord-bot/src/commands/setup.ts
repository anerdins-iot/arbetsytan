/**
 * /setup slash command — starts the onboarding wizard.
 * Shows a welcome embed with a "Kom igång" button to begin project sync.
 */
import type { ChatInputCommandInteraction } from "discord.js";
import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import {
  identifyUser,
  getTenantFromGuild,
} from "../services/user-identification.js";
import {
  createOnboardingWelcomeEmbed,
  createErrorEmbed,
} from "../components/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription(
    "Starta onboarding-wizard \u2014 koppla projekt till Discord-kanaler"
  );

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Det h\u00E4r kommandot kan bara anv\u00E4ndas i en server."
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const tenant = await getTenantFromGuild(interaction.guildId);
  if (!tenant) {
    await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Den h\u00E4r servern \u00E4r inte kopplad till n\u00E5gon ArbetsYtan-tenant.",
          "Be en admin att koppla servern i ArbetsYtan-inst\u00E4llningarna."
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const user = await identifyUser(interaction.user.id, tenant.id);
  if (!user || (user.userRole !== "ADMIN" && user.userRole !== "PROJECT_MANAGER")) {
    await interaction.reply({
      embeds: [
        createErrorEmbed(
          "Du har inte beh\u00F6righet att k\u00F6ra setup.",
          "Endast Admin och Projektledare kan konfigurera Discord-synkning."
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const welcomeEmbed = createOnboardingWelcomeEmbed();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("start_onboarding")
      .setLabel("Kom ig\u00E5ng")
      .setEmoji("\u{1F680}")
      .setStyle(ButtonStyle.Success)
  );

  await interaction.reply({
    embeds: [welcomeEmbed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}
