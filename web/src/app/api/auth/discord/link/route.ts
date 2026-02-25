/**
 * GET /api/auth/discord/link
 *
 * Initiates Discord OAuth2 flow for linking a Discord account to the
 * currently logged-in user.  Requires an active session.
 *
 * 1. Validates the user is authenticated via getSession().
 * 2. Generates a random `state` token, stores it in a secure cookie.
 * 3. Redirects the browser to Discord's OAuth2 authorize endpoint.
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

  const appUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const redirectUri =
    process.env.DISCORD_REDIRECT_URI ?? `${appUrl}/api/auth/discord/callback`;

  // Generate a random state token to prevent CSRF
  const state = randomBytes(32).toString("hex");

  // Build the Discord OAuth2 authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state,
  });

  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

  // Set state in a secure, httpOnly cookie so we can verify it in the callback
  const response = NextResponse.redirect(discordAuthUrl);
  response.cookies.set("discord_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
