"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Server,
  FolderOpen,
  Shield,
  Loader2,
} from "lucide-react";
import { DiscordServerPicker } from "./DiscordServerPicker";
import {
  connectDiscordServer,
  createDiscordCategory,
  updateRoleMapping,
  type DiscordSettingsData,
} from "@/actions/discord";

type WizardStep = "welcome" | "server" | "categories" | "roles" | "confirm";

const STEPS: WizardStep[] = [
  "welcome",
  "server",
  "categories",
  "roles",
  "confirm",
];

type CategoryConfig = {
  name: string;
  type: "PROJECTS" | "SUPPORT" | "GENERAL" | "WELCOME";
  enabled: boolean;
};

type RoleConfig = {
  systemRole: string;
  discordRoleName: string;
  color: string;
};

const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { name: "Projekt", type: "PROJECTS", enabled: true },
  { name: "Support", type: "SUPPORT", enabled: true },
  { name: "Allmänt", type: "GENERAL", enabled: true },
  { name: "Välkommen", type: "WELCOME", enabled: true },
];

const DEFAULT_ROLES: RoleConfig[] = [
  { systemRole: "ADMIN", discordRoleName: "Admin", color: "#E74C3C" },
  {
    systemRole: "PROJECT_MANAGER",
    discordRoleName: "Projektledare",
    color: "#3498DB",
  },
  { systemRole: "WORKER", discordRoleName: "Montör", color: "#2ECC71" },
];

type DiscordSetupWizardProps = {
  settings: DiscordSettingsData;
};

export function DiscordSetupWizard({ settings }: DiscordSetupWizardProps) {
  const t = useTranslations("settings.discord.wizard");
  const tSetup = useTranslations("settings.discord.setup");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState<WizardStep>("welcome");
  const [error, setError] = useState<string | null>(null);

  // Server selection state
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [selectedGuildName, setSelectedGuildName] = useState<string | null>(
    null
  );
  const [serverConnected, setServerConnected] = useState(false);

  // Category config
  const [categories, setCategories] =
    useState<CategoryConfig[]>(DEFAULT_CATEGORIES);

  // Role config
  const [roles, setRoles] = useState<RoleConfig[]>(DEFAULT_ROLES);

  const stepIndex = STEPS.indexOf(currentStep);

  function goNext() {
    if (stepIndex < STEPS.length - 1) {
      setError(null);
      setCurrentStep(STEPS[stepIndex + 1]);
    }
  }

  function goBack() {
    if (stepIndex > 0) {
      setError(null);
      setCurrentStep(STEPS[stepIndex - 1]);
    }
  }

  function handleServerSelect(guildId: string, guildName: string) {
    setSelectedGuildId(guildId);
    setSelectedGuildName(guildName);

    // Generate bot invite URL with guild_id pre-selected
    const clientId = settings.botInviteUrl
      ? new URL(settings.botInviteUrl).searchParams.get("client_id")
      : null;
    if (clientId) {
      const params = new URLSearchParams({
        client_id: clientId,
        permissions: "275146730576",
        scope: "bot applications.commands",
        guild_id: guildId,
      });
      window.open(
        `https://discord.com/oauth2/authorize?${params.toString()}`,
        "_blank"
      );
    }
  }

  async function handleVerifyAndConnect() {
    if (!selectedGuildId) return;
    setError(null);

    startTransition(async () => {
      const result = await connectDiscordServer(selectedGuildId);
      if (result.success) {
        setServerConnected(true);
        goNext();
      } else {
        const errorKey =
          result.error === "BOT_NOT_AVAILABLE"
            ? "errors.botNotAvailable"
            : result.error === "BOT_NOT_IN_SERVER"
              ? "errors.botNotInServer"
              : "errors.connectFailed";
        setError(tSetup(errorKey.replace("errors.", "") as "connecting"));
      }
    });
  }

  function toggleCategory(index: number) {
    setCategories((prev) =>
      prev.map((c, i) =>
        i === index ? { ...c, enabled: !c.enabled } : c
      )
    );
  }

  function updateCategoryName(index: number, name: string) {
    setCategories((prev) =>
      prev.map((c, i) => (i === index ? { ...c, name } : c))
    );
  }

  function updateRoleName(index: number, discordRoleName: string) {
    setRoles((prev) =>
      prev.map((r, i) => (i === index ? { ...r, discordRoleName } : r))
    );
  }

  function updateRoleColor(index: number, color: string) {
    setRoles((prev) =>
      prev.map((r, i) => (i === index ? { ...r, color } : r))
    );
  }

  async function handleCreateAll() {
    setError(null);
    startTransition(async () => {
      try {
        // Create enabled categories
        for (const cat of categories.filter((c) => c.enabled)) {
          const result = await createDiscordCategory({
            name: cat.name,
            type: cat.type,
          });
          if (!result.success && result.error !== "DUPLICATE_TYPE") {
            setError(t("confirmation.title"));
            return;
          }
        }

        // Update role mappings
        for (const role of roles) {
          await updateRoleMapping({
            systemRole: role.systemRole,
            discordRoleName: role.discordRoleName,
            color: role.color,
          });
        }

        router.refresh();
      } catch {
        setError(t("confirmation.title"));
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => (
          <div key={step} className="flex items-center">
            <div
              className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                i < stepIndex
                  ? "bg-primary text-primary-foreground"
                  : i === stepIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < stepIndex ? <Check className="size-4" /> : i + 1}
            </div>
            <span
              className={`ml-1.5 hidden text-xs sm:inline ${
                i === stepIndex
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {t(`steps.${step}`)}
            </span>
            {i < STEPS.length - 1 ? (
              <ChevronRight className="mx-2 size-4 text-muted-foreground" />
            ) : null}
          </div>
        ))}
      </div>

      <Separator />

      {/* Step content */}
      <div className="min-h-[300px]">
        {currentStep === "welcome" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="size-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {t("welcome.title")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("welcome.description")}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {currentStep === "server" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Server className="size-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">
                {t("serverSelection.title")}
              </h3>
            </div>

            {error ? (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <DiscordServerPicker
              onSelect={handleServerSelect}
              connectedGuildId={settings.discordGuildId}
            />

            {selectedGuildId && !serverConnected ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="mb-3 text-sm text-foreground">
                  {selectedGuildName
                    ? tSetup("connectedTo", { guildId: selectedGuildName })
                    : ""}
                </p>
                <Button
                  onClick={handleVerifyAndConnect}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 size-4" />
                  )}
                  {isPending
                    ? tSetup("connecting")
                    : tSetup("connectButton")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {currentStep === "categories" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <FolderOpen className="size-5 text-primary" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {t("categories.title")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("categories.description")}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {categories.map((cat, i) => (
                <div
                  key={cat.type}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  <input
                    type="checkbox"
                    checked={cat.enabled}
                    onChange={() => toggleCategory(i)}
                    className="size-4 rounded border border-input"
                  />
                  <div className="flex-1">
                    <Input
                      value={cat.name}
                      onChange={(e) => updateCategoryName(i, e.target.value)}
                      disabled={!cat.enabled}
                      className="h-8"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {cat.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {currentStep === "roles" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Shield className="size-5 text-primary" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {t("roles.title")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("roles.description")}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {roles.map((role, i) => (
                <div
                  key={role.systemRole}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  <span className="w-28 shrink-0 text-sm font-medium text-foreground">
                    {role.systemRole}
                  </span>
                  <div className="flex-1">
                    <Label className="sr-only">
                      {t("roles.title")}
                    </Label>
                    <Input
                      value={role.discordRoleName}
                      onChange={(e) => updateRoleName(i, e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <input
                    type="color"
                    value={role.color}
                    onChange={(e) => updateRoleColor(i, e.target.value)}
                    className="size-8 cursor-pointer rounded border border-border"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {currentStep === "confirm" ? (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">
              {t("confirmation.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("confirmation.description")}
            </p>

            {error ? (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="rounded-lg border border-border p-4">
                <h4 className="mb-2 text-sm font-semibold text-foreground">
                  {t("categories.title")}
                </h4>
                <ul className="space-y-1">
                  {categories
                    .filter((c) => c.enabled)
                    .map((c) => (
                      <li
                        key={c.type}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <Check className="size-3.5 text-primary" />
                        {c.name} ({c.type})
                      </li>
                    ))}
                </ul>
              </div>

              <div className="rounded-lg border border-border p-4">
                <h4 className="mb-2 text-sm font-semibold text-foreground">
                  {t("roles.title")}
                </h4>
                <ul className="space-y-1">
                  {roles.map((r) => (
                    <li
                      key={r.systemRole}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <div
                        className="size-3 rounded-full"
                        style={{ backgroundColor: r.color }}
                      />
                      {r.systemRole} → {r.discordRoleName}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <Button
              onClick={handleCreateAll}
              disabled={isPending}
              className="w-full"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t("confirmation.creating")}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 size-4" />
                  {t("confirmation.createAll")}
                </>
              )}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Navigation buttons */}
      <Separator />
      <div className="flex justify-between">
        <Button
          variant="ghost"
          onClick={goBack}
          disabled={stepIndex === 0 || isPending}
        >
          <ChevronLeft className="mr-1 size-4" />
          {t("back")}
        </Button>

        {currentStep !== "confirm" && currentStep !== "server" ? (
          <Button onClick={goNext} disabled={isPending}>
            {t("next")}
            <ChevronRight className="ml-1 size-4" />
          </Button>
        ) : null}

        {currentStep === "server" && serverConnected ? (
          <Button onClick={goNext}>
            {t("next")}
            <ChevronRight className="ml-1 size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
