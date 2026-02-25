/**
 * Error embed builders for common error scenarios.
 * Provides consistent, user-friendly error messages in Discord.
 */
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const COLORS = {
  ERROR: 0xef4444,
  WARNING: 0xf59e0b,
  INFO: 0x3b82f6,
} as const;

const APP_URL = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "https://app.arbetsytan.se";

/**
 * Create a generic error embed with title and description.
 */
export function createErrorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle(`\u274C ${title}`)
    .setDescription(description)
    .setTimestamp();
}

/**
 * Create an embed for unauthorized (unlinked) users.
 * Includes a link button to connect their Discord account.
 */
export function createUnauthorizedEmbed(): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<ButtonBuilder>;
} {
  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle("\u{1F512} Konto ej kopplat")
    .setDescription(
      "Du behöver koppla ditt Discord-konto till ArbetsYtan för att använda boten.\n\n" +
      "**Så här gör du:**\n" +
      "1. Klicka på knappen nedan\n" +
      "2. Logga in på ditt konto\n" +
      "3. Godkänn Discord-kopplingen\n" +
      "4. Kom tillbaka och prova igen!"
    )
    .setFooter({ text: "Kontakta din administratör om du har frågor." })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Koppla ditt konto")
      .setStyle(ButtonStyle.Link)
      .setURL(`${APP_URL}/settings`)
  );

  return { embed, row };
}

/**
 * Create an embed for rate-limited users.
 */
export function createRateLimitedEmbed(retryAfterSeconds: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle("\u23F3 Lugna ner dig lite")
    .setDescription(
      "Du har skickat för många förfrågningar. " +
      `Vänta **${retryAfterSeconds} sekund${retryAfterSeconds !== 1 ? "er" : ""}** och försök igen.`
    )
    .setFooter({ text: "Max 10 AI-förfrågningar per minut." })
    .setTimestamp();
}

/**
 * Create an embed for AI service errors (503, timeout, etc.).
 */
export function createAIUnavailableEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle("\u{1F6A8} AI-tjänsten är inte tillgänglig")
    .setDescription(
      "AI-assistenten kan inte nås just nu. Detta kan bero på:\n" +
      "- Hög belastning på AI-tjänsten\n" +
      "- Tillfälligt nätverksfel\n" +
      "- Konfigurationsproblem\n\n" +
      "Försök igen om en stund."
    )
    .setTimestamp();
}

/**
 * Create an embed for generic unexpected errors.
 */
export function createGenericErrorEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.ERROR)
    .setTitle("\u274C Ett oväntat fel uppstod")
    .setDescription("Något gick fel. Försök igen senare. Om problemet kvarstår, kontakta din administratör.")
    .setTimestamp();
}
