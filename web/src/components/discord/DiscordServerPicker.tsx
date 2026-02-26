"use client";

import { useState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, Check, Users, ServerIcon } from "lucide-react";

export type DiscordGuildInfo = {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
};

type DiscordServerPickerProps = {
  onSelect: (guildId: string, guildName: string) => void;
  connectedGuildId?: string | null;
};

function GuildIcon({ guild }: { guild: DiscordGuildInfo }) {
  if (guild.icon) {
    return (
      <img
        src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`}
        alt={guild.name}
        className="size-10 rounded-full"
      />
    );
  }

  const initials = guild.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
      {initials}
    </div>
  );
}

export function DiscordServerPicker({
  onSelect,
  connectedGuildId,
}: DiscordServerPickerProps) {
  const t = useTranslations("settings.discord.wizard.serverSelection");
  const [guilds, setGuilds] = useState<DiscordGuildInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetchGuilds();
  }, []);

  function fetchGuilds() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/discord/servers");
        if (res.ok) {
          const data = (await res.json()) as { guilds: DiscordGuildInfo[] };
          setGuilds(data.guilds);
        }
      } catch {
        // Silently fail — guilds will be empty
      }
      setLoaded(true);
    });
  }

  function handleRefresh() {
    // Re-trigger OAuth flow to refresh the guild list
    window.location.href = "/api/auth/discord/servers";
  }

  // Not loaded yet or no guilds cached — show connect button
  if (loaded && guilds.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("selectServer")}
        </p>
        <Button asChild>
          <a href="/api/auth/discord/servers">
            <ServerIcon className="mr-2 size-4" />
            {t("connectWithDiscord")}
          </a>
        </Button>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="size-4 animate-spin" />
        {t("selectServer")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("selectServer")}
        </p>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isPending}>
          <RefreshCw className="mr-1 size-3.5" />
          {t("refresh")}
        </Button>
      </div>

      <div className="space-y-2">
        {guilds.map((guild) => {
          const isConnected = connectedGuildId === guild.id;
          return (
            <div
              key={guild.id}
              className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
            >
              <GuildIcon guild={guild} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {guild.name}
                </p>
                {guild.memberCount > 0 ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    {guild.memberCount}
                  </p>
                ) : null}
              </div>
              {isConnected ? (
                <span className="flex items-center gap-1 text-xs font-medium text-primary">
                  <Check className="size-3.5" />
                  {t("botAlreadyAdded")}
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSelect(guild.id, guild.name)}
                >
                  <ExternalLink className="mr-1.5 size-3.5" />
                  {t("addBot")}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {guilds.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noServers")}</p>
      ) : null}
    </div>
  );
}
