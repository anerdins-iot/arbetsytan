import { Client, Events, Message } from "discord.js";
import { identifyUser, getTenantFromGuild, validateProjectAccess } from "../services/user-identification.js";
import { buildMessageContext, getChannelContext } from "../services/context.js";
import { handleAIMessage } from "../handlers/message.js";

const LINK_ACCOUNT_INSTRUCTION =
  "Du är inte kopplad till ArbetsYtan. Länka ditt Discord-konto i webbappen under Inställningar → Koppla Discord.";

function shouldHandleMessage(message: Message, clientUserId: string): boolean {
  if (message.author.bot) return false;

  const isDM = !message.guildId;
  const isMentioned = message.mentions.users.has(clientUserId);
  const refMsg =
    message.reference?.messageId != null && "messages" in message.channel
      ? message.channel.messages.cache.get(message.reference.messageId)
      : undefined;
  const isReplyToBot = refMsg?.author.id === clientUserId;

  return isDM || isMentioned || isReplyToBot;
}

export function registerMessageCreate(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    const clientUser = client.user;
    if (!clientUser) return;

    if (!shouldHandleMessage(message, clientUser.id)) return;

    const discordUserId = message.author.id;
    let tenantId: string | undefined;
    if (message.guildId) {
      const tenant = await getTenantFromGuild(message.guildId);
      tenantId = tenant?.id;
    }

    const user = await identifyUser(discordUserId, tenantId);
    if (!user) {
      await message.reply(LINK_ACCOUNT_INSTRUCTION).catch(() => {});
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
  });
}
