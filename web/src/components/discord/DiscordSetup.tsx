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
import {
  CheckCircle,
  Unplug,
  Link as LinkIcon,
  ExternalLink,
  Bot,
  Shield,
  Hash,
  Users,
  MessageSquare,
  FolderOpen,
  Clock,
} from "lucide-react";

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
        const errorKey =
          result.error === "BOT_NOT_AVAILABLE"
            ? "errors.botNotAvailable"
            : result.error === "BOT_NOT_IN_SERVER"
              ? "errors.botNotInServer"
              : "errors.connectFailed";
        setError(t(errorKey));
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

  // Not connected — show step-by-step setup
  if (!settings.discordGuildId) {
    return (
      <div className="space-y-6">
        {/* Step 1: Add bot to server */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
              1
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-card-foreground">
                {t("setup.step1Title")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("setup.step1Description")}
              </p>

              {settings.botInviteUrl ? (
                <Button className="mt-4" asChild>
                  <a
                    href={settings.botInviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Bot className="mr-2 size-4" />
                    {t("setup.addBotButton")}
                    <ExternalLink className="ml-2 size-3.5" />
                  </a>
                </Button>
              ) : (
                <p className="mt-3 text-sm text-destructive">
                  {t("errors.noClientId")}
                </p>
              )}

              {/* Permission info */}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  {t("setup.permissionsTitle")}
                </summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <PermissionItem
                    icon={<FolderOpen className="size-4" />}
                    label={t("setup.permissions.manageChannels")}
                    description={t("setup.permissions.manageChannelsDesc")}
                  />
                  <PermissionItem
                    icon={<Shield className="size-4" />}
                    label={t("setup.permissions.manageRoles")}
                    description={t("setup.permissions.manageRolesDesc")}
                  />
                  <PermissionItem
                    icon={<MessageSquare className="size-4" />}
                    label={t("setup.permissions.sendMessages")}
                    description={t("setup.permissions.sendMessagesDesc")}
                  />
                  <PermissionItem
                    icon={<Hash className="size-4" />}
                    label={t("setup.permissions.viewChannels")}
                    description={t("setup.permissions.viewChannelsDesc")}
                  />
                  <PermissionItem
                    icon={<Users className="size-4" />}
                    label={t("setup.permissions.embedLinks")}
                    description={t("setup.permissions.embedLinksDesc")}
                  />
                  <PermissionItem
                    icon={<Clock className="size-4" />}
                    label={t("setup.permissions.readHistory")}
                    description={t("setup.permissions.readHistoryDesc")}
                  />
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* Step 2: Enter Guild ID */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
              2
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-card-foreground">
                  {t("setup.step2Title")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("setup.step2Description")}
                </p>
              </div>

              {error ? (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {success ? (
                <div className="rounded-md border border-primary/20 bg-primary/10 p-3 text-sm text-foreground">
                  {t("setup.connected")}
                </div>
              ) : null}

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
          </div>
        </div>
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

function PermissionItem({
  icon,
  label,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/30 p-2.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
