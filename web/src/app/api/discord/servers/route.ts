/**
 * GET /api/discord/servers
 *
 * Returns cached guilds from the cookie set by the OAuth callback.
 * DELETE clears the cached guilds cookie.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";

export type DiscordGuildInfo = {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
};

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookie = request.cookies.get("discord_guilds")?.value;
  if (!cookie) {
    return NextResponse.json({ guilds: [] });
  }

  try {
    const guilds = JSON.parse(cookie) as DiscordGuildInfo[];
    return NextResponse.json({ guilds });
  } catch {
    return NextResponse.json({ guilds: [] });
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete("discord_guilds");
  return response;
}
