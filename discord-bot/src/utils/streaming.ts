/**
 * Streaming utility — edit-pattern for Discord.
 * Sends an initial "thinking" message and edits it as the response comes in.
 * Since we use HTTP (non-streaming) from the AI adapter, this simulates
 * the pattern by showing a loading state then the final result.
 */
import type { Message, TextChannel, DMChannel } from "discord.js";

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Send an AI response to Discord with the edit-pattern.
 * 1. Sends initial "thinking" message
 * 2. Edits with the final AI response
 *
 * Handles edge cases:
 * - Channel deleted during processing
 * - User blocked the bot (DM errors)
 * - Message too long (splits into chunks)
 *
 * Returns the bot's message for future reference, or null if sending failed.
 */
export async function sendWithThinking(
  channel: TextChannel | DMChannel,
  responseText: string,
  replyTo?: Message
): Promise<Message | null> {
  let botMessage: Message;

  try {
    // Send initial thinking message
    botMessage = await channel.send({
      content: "\u{1F4AD} Tänker...",
      ...(replyTo && { reply: { messageReference: replyTo.id } }),
    });
  } catch (err) {
    const code = (err as { code?: number }).code;
    // 50007 = Cannot send messages to this user (blocked bot / DMs disabled)
    // 10003 = Unknown Channel (deleted)
    // 50001 = Missing Access
    if (code === 50007 || code === 10003 || code === 50001) {
      console.warn(`[streaming] Cannot send to channel (code ${code}), skipping.`);
      return null;
    }
    throw err;
  }

  // Edit with final response
  try {
    if (responseText.length <= MAX_MESSAGE_LENGTH) {
      await botMessage.edit(responseText);
    } else {
      // Split long responses across the initial message + follow-up messages
      const chunks = splitMessage(responseText);
      await botMessage.edit(chunks[0]);
      for (let i = 1; i < chunks.length; i++) {
        await channel.send(chunks[i]).catch((sendErr) => {
          console.warn("[streaming] Failed to send follow-up chunk:", sendErr);
        });
      }
    }
  } catch (editErr) {
    // If editing fails (e.g. message was deleted), try sending a fresh message
    console.warn("[streaming] Failed to edit message, trying fresh send:", editErr);
    try {
      if (responseText.length <= MAX_MESSAGE_LENGTH) {
        await channel.send(responseText);
      } else {
        const chunks = splitMessage(responseText);
        for (const chunk of chunks) {
          await channel.send(chunk).catch(() => {});
        }
      }
    } catch {
      console.error("[streaming] Failed to send response entirely.");
    }
  }

  return botMessage;
}

/**
 * Split a long message into chunks that fit within Discord's 2000 char limit.
 * Tries to split at paragraph boundaries first, then at line breaks.
 */
function splitMessage(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to find a good split point
    let splitAt = remaining.lastIndexOf("\n\n", MAX_MESSAGE_LENGTH);
    if (splitAt < MAX_MESSAGE_LENGTH / 2) {
      splitAt = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    }
    if (splitAt < MAX_MESSAGE_LENGTH / 2) {
      splitAt = remaining.lastIndexOf(" ", MAX_MESSAGE_LENGTH);
    }
    if (splitAt < MAX_MESSAGE_LENGTH / 2) {
      splitAt = MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}
