/**
 * GET /api/auth/discord/servers/callback
 *
 * OAuth2 callback for the guilds flow. Exchanges the code for a token,
 * fetches the user's guilds, filters to those with MANAGE_GUILD permission,
 * stores them in a cookie, and redirects back to settings.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  approximate_member_count?: number;
}

const MANAGE_GUILD = 0x20;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl =
    process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/sv/settings/discord?discord_error=${error}`
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state" },
      { status: 400 }
    );
  }

  const storedState = request.cookies.get("discord_servers_oauth_state")?.value;
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

  const redirectUri = `${appUrl}/api/auth/discord/servers/callback`;

  try {
    // Exchange code for token
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
      console.error(
        "[discord-servers-callback] Token exchange failed:",
        await tokenRes.text()
      );
      return NextResponse.redirect(
        `${appUrl}/sv/settings/discord?discord_error=token_exchange_failed`
      );
    }

    const tokenData = (await tokenRes.json()) as DiscordTokenResponse;

    // Fetch user's guilds
    const guildsRes = await fetch(
      "https://discord.com/api/users/@me/guilds?with_counts=true",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );

    if (!guildsRes.ok) {
      console.error(
        "[discord-servers-callback] Guilds fetch failed:",
        await guildsRes.text()
      );
      return NextResponse.redirect(
        `${appUrl}/sv/settings/discord?discord_error=guilds_fetch_failed`
      );
    }

    const allGuilds = (await guildsRes.json()) as DiscordGuild[];

    // Filter to guilds where user has MANAGE_GUILD permission
    const manageable = allGuilds
      .filter((g) => {
        const perms = BigInt(g.permissions);
        return (perms & BigInt(MANAGE_GUILD)) === BigInt(MANAGE_GUILD);
      })
      .map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        memberCount: g.approximate_member_count ?? 0,
      }));

    // Store in cookie (max ~4KB — should be fine for most users)
    const response = NextResponse.redirect(
      `${appUrl}/sv/settings/discord?servers_loaded=true`
    );
    response.cookies.delete("discord_servers_oauth_state");
    response.cookies.set("discord_guilds", JSON.stringify(manageable), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 3600, // 1 hour
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[discord-servers-callback] Unexpected error:", err);
    return NextResponse.redirect(
      `${appUrl}/sv/settings/discord?discord_error=unexpected`
    );
  }
}
