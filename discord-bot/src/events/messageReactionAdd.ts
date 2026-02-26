/**
 * Discord→Webb sync: Reaction-based task status changes.
 * ✅ on a task embed → mark task as DONE
 * 🔄 on a task embed → mark task as IN_PROGRESS
 */
import { Client, Events, MessageReaction, User, PartialMessageReaction, PartialUser } from "discord.js";
import { prisma } from "../lib/prisma.js";
import { Redis } from "ioredis";

const REACTION_MAP: Record<string, string> = {
  "✅": "DONE",
  "🔄": "IN_PROGRESS",
};

/** Redis publisher for sending events back to web app */
let publisher: Redis | null = null;

function getPublisher(): Redis | null {
  if (publisher) return publisher;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  publisher = new Redis(redisUrl);
  publisher.on("error", (err) => {
    console.error("[messageReactionAdd] Redis publisher error:", err.message);
  });
  return publisher;
}

/**
 * Extract task ID from an embed that has a URL like .../projects/{pid}?task={taskId}
 */
function extractTaskIdFromEmbed(message: { embeds: { url?: string | null }[] }): {
  taskId: string;
  projectId: string;
} | null {
  for (const embed of message.embeds) {
    const url = embed.url;
    if (!url) continue;
    const taskMatch = url.match(/projects\/([^/?]+)\?task=([^&]+)/);
    if (taskMatch) {
      return { projectId: taskMatch[1], taskId: taskMatch[2] };
    }
  }
  return null;
}

export function registerMessageReactionAdd(client: Client): void {
  client.on(
    Events.MessageReactionAdd,
    async (
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser
    ) => {
      try {
        // Ignore bot reactions
        if (user.bot) return;

        // Fetch partial reaction if needed
        if (reaction.partial) {
          try {
            await reaction.fetch();
          } catch {
            console.warn("[messageReactionAdd] Could not fetch partial reaction");
            return;
          }
        }

        const emoji = reaction.emoji.name;
        if (!emoji || !(emoji in REACTION_MAP)) return;

        const newStatus = REACTION_MAP[emoji];
        const message = reaction.message;

        // Only process bot messages with embeds (task notifications)
        if (message.author?.id !== client.user?.id) return;
        if (!message.embeds || message.embeds.length === 0) return;

        const taskInfo = extractTaskIdFromEmbed(message);
        if (!taskInfo) return;

        // Identify the user who reacted
        const account = await prisma.account.findFirst({
          where: {
            provider: "discord",
            providerAccountId: user.id,
          },
          select: { userId: true },
        });

        if (!account) {
          console.log("[messageReactionAdd] User not linked, ignoring reaction:", user.id);
          return;
        }

        // Publish event to Redis for web app to process
        const pub = getPublisher();
        if (!pub) {
          console.warn("[messageReactionAdd] No Redis publisher available");
          return;
        }

        await pub.publish(
          "webapp:task-status-changed",
          JSON.stringify({
            taskId: taskInfo.taskId,
            projectId: taskInfo.projectId,
            newStatus,
            userId: account.userId,
            source: "discord-reaction",
          })
        );

        console.log(
          `[messageReactionAdd] ${emoji} on task ${taskInfo.taskId} → status=${newStatus} by user ${account.userId}`
        );
      } catch (err) {
        console.error("[messageReactionAdd] Error handling reaction:", err);
      }
    }
  );
}
