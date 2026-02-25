import { Client, Events, Message } from "discord.js";

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

    // Placeholder for future AI handling: log the message
    const channelLabel = message.guildId
      ? `#${"name" in message.channel ? message.channel.name : "channel"}`
      : "DM";
    console.log(
      `[${channelLabel}] ${message.author.tag}: ${message.content || "(no text)"}`
    );
  });
}
