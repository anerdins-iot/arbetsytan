/**
 * GET /api/auth/discord/callback
 *
 * Handles the OAuth2 callback from Discord after the user authorises the app.
 *
 * 1. Verifies the `state` token from the cookie matches the query parameter.
 * 2. Exchanges the authorisation code for an access token via Discord API.
 * 3. Fetches the Discord user profile from /users/@me.
 * 4. Upserts an Account record linking the Discord identity to the current user.
 * 5. Publishes a `discord:user-linked` event via Redis for the bot to react on.
 * 6. Redirects to /settings/discord?linked=true on success.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishDiscordEvent } from "@/lib/redis-pubsub";

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  global_name: string | null;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Discord may redirect back with an error (e.g. user denied)
  if (error) {
    const appUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    return NextResponse.redirect(`${appUrl}/sv/settings?discord_error=${error}`);
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state" },
      { status: 400 }
    );
  }

  // Verify state token from cookie
  const storedState = request.cookies.get("discord_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.json(
      { error: "Invalid state token" },
      { status: 403 }
    );
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Discord OAuth2 not configured" },
      { status: 500 }
    );
  }

  const appUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const redirectUri =
    process.env.DISCORD_REDIRECT_URI ?? `${appUrl}/api/auth/discord/callback`;

  try {
    // --- Exchange authorisation code for access token ---
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("[discord-callback] Token exchange failed:", text);
      return NextResponse.redirect(
        `${appUrl}/sv/settings?discord_error=token_exchange_failed`
      );
    }

    const tokenData = (await tokenRes.json()) as DiscordTokenResponse;

    // --- Fetch Discord user info ---
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      console.error("[discord-callback] User fetch failed:", await userRes.text());
      return NextResponse.redirect(
        `${appUrl}/sv/settings?discord_error=user_fetch_failed`
      );
    }

    const discordUser = (await userRes.json()) as DiscordUser;

    // --- Upsert Account record ---
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: "discord",
          providerAccountId: discordUser.id,
        },
      },
      update: {
        userId: session.user.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + tokenData.expires_in,
        token_type: tokenData.token_type,
        scope: tokenData.scope,
      },
      create: {
        userId: session.user.id,
        type: "oauth",
        provider: "discord",
        providerAccountId: discordUser.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + tokenData.expires_in,
        token_type: tokenData.token_type,
        scope: tokenData.scope,
      },
    });

    // --- Publish event via Redis for Discord bot ---
    await publishDiscordEvent("discord:user-linked", {
      userId: session.user.id,
      tenantId: session.tenantId,
      discordUserId: discordUser.id,
      discordUsername: discordUser.username,
    });

    // Clear the state cookie and redirect to settings
    const response = NextResponse.redirect(
      `${appUrl}/sv/settings?discord_linked=true`
    );
    response.cookies.delete("discord_oauth_state");
    return response;
  } catch (err) {
    console.error("[discord-callback] Unexpected error:", err);
    return NextResponse.redirect(
      `${appUrl}/sv/settings?discord_error=unexpected`
    );
  }
}
