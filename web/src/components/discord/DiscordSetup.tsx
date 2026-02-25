"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  connectDiscordServer,
  disconnectDiscordServer,
  toggleDiscordBot,
  type DiscordSettingsData,
} from "@/actions/discord";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Unplug, Link as LinkIcon } from "lucide-react";

type DiscordSetupProps = {
  settings: DiscordSettingsData;
};

export function DiscordSetup({ settings }: DiscordSetupProps) {
  const t = useTranslations("settings.discord");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [guildId, setGuildId] = useState("");

  function handleConnect() {
    setError(null);
    setSuccess(false);

    if (!guildId.trim()) {
      setError(t("errors.guildIdRequired"));
      return;
    }

    startTransition(async () => {
      const result = await connectDiscordServer(guildId.trim());
      if (result.success) {
        setSuccess(true);
        setGuildId("");
        router.refresh();
      } else {
        setError(t("errors.connectFailed"));
      }
    });
  }

  function handleDisconnect() {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await disconnectDiscordServer();
      if (result.success) {
        router.refresh();
      } else {
        setError(t("errors.disconnectFailed"));
      }
    });
  }

  function handleToggleBot(enabled: boolean) {
    setError(null);

    startTransition(async () => {
      const result = await toggleDiscordBot(enabled);
      if (result.success) {
        router.refresh();
      } else {
        setError(t("errors.toggleFailed"));
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-card-foreground">
        {t("setup.title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("setup.description")}
      </p>

      {error ? (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="mt-4 rounded-md border border-primary/20 bg-primary/10 p-3 text-sm text-foreground">
          {t("setup.connected")}
        </div>
      ) : null}

      {!settings.discordGuildId ? (
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="guild-id">{t("setup.guildIdLabel")}</Label>
            <Input
              id="guild-id"
              value={guildId}
              onChange={(e) => setGuildId(e.target.value)}
              placeholder={t("setup.guildIdPlaceholder")}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              {t("setup.guildIdHelp")}
            </p>
          </div>
          <Button onClick={handleConnect} disabled={isPending}>
            <LinkIcon className="mr-2 size-4" />
            {isPending ? t("setup.connecting") : t("setup.connectButton")}
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="size-5 text-green-500" />
            <span className="text-sm font-medium text-foreground">
              {t("setup.connectedTo", { guildId: settings.discordGuildId })}
            </span>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="bot-toggle">{t("setup.botStatusLabel")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("setup.botStatusDescription")}
              </p>
            </div>
            <Switch
              id="bot-toggle"
              checked={settings.discordBotEnabled}
              onCheckedChange={handleToggleBot}
              disabled={isPending}
            />
          </div>

          <Separator />

          <Button
            variant="destructive"
            onClick={handleDisconnect}
            disabled={isPending}
          >
            <Unplug className="mr-2 size-4" />
            {isPending ? t("setup.disconnecting") : t("setup.disconnectButton")}
          </Button>
        </div>
      )}
    </div>
  );
}
