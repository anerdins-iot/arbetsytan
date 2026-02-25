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
 * Returns the bot's message for future reference.
 */
export async function sendWithThinking(
  channel: TextChannel | DMChannel,
  responseText: string,
  replyTo?: Message
): Promise<Message> {
  // Send initial thinking message
  const botMessage = await channel.send({
    content: "\u{1F4AD} Tänker...",
    ...(replyTo && { reply: { messageReference: replyTo.id } }),
  });

  // Edit with final response
  if (responseText.length <= MAX_MESSAGE_LENGTH) {
    await botMessage.edit(responseText).catch(console.error);
  } else {
    // Split long responses across the initial message + follow-up messages
    const chunks = splitMessage(responseText);
    await botMessage.edit(chunks[0]).catch(console.error);
    for (let i = 1; i < chunks.length; i++) {
      await channel.send(chunks[i]).catch(console.error);
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
