import { Client, Events, Message, MessageFlags } from "discord.js";
import { identifyUser, getTenantFromGuild, validateProjectAccess } from "../services/user-identification.js";
import { buildMessageContext, getChannelContext } from "../services/context.js";
import { handleAIMessage } from "../handlers/message.js";
import { createRateLimitedEmbed } from "../components/error-embeds.js";
import { checkRateLimit } from "../utils/rate-limiter.js";

/**
 * Check if the message immediately before this one was from the bot,
 * AND the message before that was from the same user who just wrote.
 * Pattern: User → Bot → User (same user) = continuation of conversation.
 */
async function isConversationContinuation(
  message: Message,
  clientUserId: string
): Promise<boolean> {
  // Only works in guild text channels with message history
  if (!("messages" in message.channel)) return false;

  try {
    // Fetch the last 2 messages before this one
    const recentMessages = await message.channel.messages.fetch({
      limit: 2,
      before: message.id,
    });

    if (recentMessages.size < 2) return false;

    // Sort by timestamp (newest first)
    const sorted = [...recentMessages.values()].sort(
      (a, b) => b.createdTimestamp - a.createdTimestamp
    );

    const lastMessage = sorted[0]; // Should be bot's response
    const messageBeforeThat = sorted[1]; // Should be user's original question

    // Check pattern: User(same) → Bot → User(same)
    const isBotResponse = lastMessage?.author.id === clientUserId;
    const wasOriginallyFromSameUser =
      messageBeforeThat?.author.id === message.author.id;

    // Also check that bot's message was recent (within 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const isBotResponseRecent =
      lastMessage && lastMessage.createdTimestamp > fiveMinutesAgo;

    return isBotResponse && wasOriginallyFromSameUser && isBotResponseRecent;
  } catch (error) {
    console.warn("[shouldHandleMessage] Failed to check conversation continuation:", error);
    return false;
  }
}

async function shouldHandleMessage(
  message: Message,
  clientUserId: string
): Promise<boolean> {
  if (message.author.bot) return false;

  const isDM = !message.guildId;
  const isMentioned = message.mentions.users.has(clientUserId);
  const refMsg =
    message.reference?.messageId != null && "messages" in message.channel
      ? message.channel.messages.cache.get(message.reference.messageId)
      : undefined;
  const isReplyToBot = refMsg?.author.id === clientUserId;

  // Quick checks first (no async needed)
  if (isDM || isMentioned || isReplyToBot) return true;

  // Check if this is a continuation of a recent conversation
  // Pattern: User asked → Bot answered → Same user writes again
  const isContinuation = await isConversationContinuation(message, clientUserId);

  return isContinuation;
}

export function registerMessageCreate(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      const clientUser = client.user;
      if (!clientUser) return;

      if (!(await shouldHandleMessage(message, clientUser.id))) return;

      // Verify the channel still exists and is accessible
      if (!message.channel) {
        console.warn("[messageCreate] Message received in inaccessible channel, skipping.");
        return;
      }

      const discordUserId = message.author.id;
      let tenantId: string | undefined;
      if (message.guildId) {
        const tenant = await getTenantFromGuild(message.guildId);
        tenantId = tenant?.id;
      }

      let user = await identifyUser(discordUserId, tenantId);

      // If user hasn't linked account, create a guest identity for testing
      // This allows anyone to chat with the bot, but with limited functionality
      if (!user) {
        // Try to get tenant from guild for guest access
        if (tenantId) {
          user = {
            userId: `guest-${discordUserId}`,
            tenantId: tenantId,
            userName: message.author.displayName || message.author.username,
            userRole: "GUEST",
            discordUserId,
          };
          console.log(`[messageCreate] Guest user ${user.userName} (${discordUserId}) in tenant ${tenantId}`);
        } else {
          // DM without linked account - still allow but with disclaimer
          // Use a default tenant for testing (seed-tenant-1)
          user = {
            userId: `guest-${discordUserId}`,
            tenantId: "seed-tenant-1",
            userName: message.author.displayName || message.author.username,
            userRole: "GUEST",
            discordUserId,
          };
          console.log(`[messageCreate] Guest user ${user.userName} (${discordUserId}) in DM, using default tenant`);
        }
      }

      // Check rate limit before processing AI request
      const rateCheck = checkRateLimit(user.userId);
      if (!rateCheck.allowed) {
        const embed = createRateLimitedEmbed(rateCheck.retryAfterSeconds);
        await message
          .reply({ embeds: [embed] })
          .catch(() => {});
        return;
      }

      const channelContext = await getChannelContext(message);
      const messageContext = await buildMessageContext(
        message.channel as import("discord.js").TextChannel | import("discord.js").DMChannel,
        20
      );

      let projectAccess: { projectId: string; projectName: string } | null = null;
      if (channelContext.channelType === "guild") {
        projectAccess = await validateProjectAccess(user.userId, message.channel.id);
      }

      // If in a project channel, attach projectId to context
      if (projectAccess) {
        channelContext.projectId = projectAccess.projectId;
        channelContext.projectName = projectAccess.projectName;
      }

      const channelLabel = message.guildId
        ? `#${"name" in message.channel ? message.channel.name : "channel"}`
        : "DM";
      console.log(
        `[${channelLabel}] ${message.author.tag}: ${message.content || "(no text)"}`
      );

      // Send message to AI handler
      await handleAIMessage(message, user, channelContext, messageContext);
    } catch (error) {
      console.error("[messageCreate] Unexpected error:", error);
      // Try to send a generic error reply, silently fail if we can't
      await message
        .reply("\u274C Ett oväntat fel uppstod. Försök igen senare.")
        .catch(() => {});
    }
  });
}
