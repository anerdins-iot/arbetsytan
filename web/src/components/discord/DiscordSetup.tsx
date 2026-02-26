"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  disconnectDiscordServer,
  toggleDiscordBot,
  type DiscordSettingsData,
} from "@/actions/discord";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Unplug } from "lucide-react";
import { DiscordSetupWizard } from "./DiscordSetupWizard";

type DiscordSetupProps = {
  settings: DiscordSettingsData;
};

export function DiscordSetup({ settings }: DiscordSetupProps) {
  const t = useTranslations("settings.discord");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDisconnect() {
    setError(null);

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

  // Not connected — show setup wizard
  if (!settings.discordGuildId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <DiscordSetupWizard settings={settings} />
      </div>
    );
  }

  // Connected — show status and controls
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
    </div>
  );
}
