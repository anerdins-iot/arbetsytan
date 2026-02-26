/**
 * GET /api/auth/discord/servers
 *
 * Initiates Discord OAuth2 flow with `identify guilds` scope so the admin
 * can pick a server from a list instead of manually entering a guild ID.
 */
import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/auth";

export async function GET(_request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "DISCORD_CLIENT_ID is not configured" },
      { status: 500 }
    );
  }

  const appUrl =
    process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/discord/servers/callback`;

  const state = randomBytes(32).toString("hex");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds",
    state,
  });

  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

  const response = NextResponse.redirect(discordAuthUrl);
  response.cookies.set("discord_servers_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
