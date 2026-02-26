import type { Message, TextChannel, DMChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { prisma } from "../lib/prisma.js";

export interface ChannelContext {
  channelType: "dm" | "guild";
  channelName?: string;
  guildId?: string;
  projectId?: string;
  projectName?: string;
}

export interface MessageContext {
  author: string;
  content: string;
  timestamp: Date;
}

/**
 * Build context from the last N messages in a channel.
 */
export async function buildMessageContext(
  channel: TextChannel | DMChannel,
  limit: number = 20
): Promise<MessageContext[]> {
  const messages = await channel.messages.fetch({ limit });

  return messages
    .filter((m) => !m.author.bot || m.author.id === channel.client.user?.id)
    .map((m) => ({
      author: m.author.username,
      content: m.content,
      timestamp: m.createdAt,
    }))
    .reverse(); // Oldest first
}

/**
 * Get channel context (guild, project, etc.)
 */
export async function getChannelContext(
  message: Message
): Promise<ChannelContext> {
  if (message.channel.type === ChannelType.DM) {
    return { channelType: "dm" };
  }

  const channel = message.channel as TextChannel;
  const context: ChannelContext = {
    channelType: "guild",
    channelName: channel.name,
    guildId: message.guildId ?? undefined,
  };

  // First, check if this is a main project channel (Project.discordChannelId)
  let project = await prisma.project.findUnique({
    where: { discordChannelId: channel.id },
    select: { id: true, name: true },
  });

  // If not found, check DiscordProjectChannel (general, tasks, files, activity channels)
  if (!project) {
    const projectChannel = await prisma.discordProjectChannel.findUnique({
      where: { discordChannelId: channel.id },
      select: {
        projectId: true,
        project: { select: { name: true } },
      },
    });
    if (projectChannel) {
      project = {
        id: projectChannel.projectId,
        name: projectChannel.project.name,
      };
    }
  }

  if (project) {
    context.projectId = project.id;
    context.projectName = project.name;
  }

  return context;
}
