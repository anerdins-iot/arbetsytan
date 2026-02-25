"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  updateRoleMapping,
  syncRoles,
  type DiscordRoleMappingData,
} from "@/actions/discord";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Pencil } from "lucide-react";

type RoleManagerProps = {
  mappings: DiscordRoleMappingData[];
};

const DEFAULT_ROLE_MAPPINGS = [
  { systemRole: "ADMIN", discordRoleName: "Admin", color: "#E74C3C" },
  {
    systemRole: "PROJECT_MANAGER",
    discordRoleName: "Projektledare",
    color: "#3498DB",
  },
  { systemRole: "WORKER", discordRoleName: "Montör", color: "#27AE60" },
] as const;

export function RoleManager({ mappings }: RoleManagerProps) {
  const t = useTranslations("settings.discord.roles");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editSystemRole, setEditSystemRole] = useState("");
  const [editRoleName, setEditRoleName] = useState("");
  const [editColor, setEditColor] = useState("#000000");

  // Merge defaults with existing mappings
  const displayMappings = DEFAULT_ROLE_MAPPINGS.map((defaultMapping) => {
    const existing = mappings.find(
      (m) => m.systemRole === defaultMapping.systemRole
    );
    return {
      systemRole: defaultMapping.systemRole,
      discordRoleName:
        existing?.discordRoleName ?? defaultMapping.discordRoleName,
      color: existing?.color ?? defaultMapping.color,
      discordRoleId: existing?.discordRoleId ?? "",
      id: existing?.id ?? null,
    };
  });

  function openEditDialog(
    systemRole: string,
    currentName: string,
    currentColor: string
  ) {
    setEditSystemRole(systemRole);
    setEditRoleName(currentName);
    setEditColor(currentColor);
    setEditDialogOpen(true);
  }

  function handleSaveMapping() {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await updateRoleMapping({
        systemRole: editSystemRole,
        discordRoleName: editRoleName,
        color: editColor,
      });
      if (result.success) {
        setEditDialogOpen(false);
        setSuccess(true);
        router.refresh();
      } else {
        setError(t("errors.updateFailed"));
      }
    });
  }

  function handleSyncRoles() {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await syncRoles();
      if (result.success) {
        setSuccess(true);
      } else if (result.error === "DISCORD_NOT_CONNECTED") {
        setError(t("errors.notConnected"));
      } else {
        setError(t("errors.syncFailed"));
      }
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-md border border-primary/20 bg-primary/10 p-3 text-sm text-foreground">
          {t("saved")}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncRoles}
          disabled={isPending}
        >
          <RefreshCw
            className={`mr-2 size-4 ${isPending ? "animate-spin" : ""}`}
          />
          {t("syncButton")}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.systemRole")}</TableHead>
              <TableHead>{t("columns.discordRole")}</TableHead>
              <TableHead>{t("columns.color")}</TableHead>
              <TableHead className="text-right">
                {t("columns.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayMappings.map((mapping) => (
              <TableRow key={mapping.systemRole}>
                <TableCell className="font-medium">
                  {t(`systemRoles.${mapping.systemRole}`)}
                </TableCell>
                <TableCell>{mapping.discordRoleName}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block size-4 rounded-full border border-border"
                      style={{ backgroundColor: mapping.color }}
                    />
                    <span className="font-mono text-xs text-muted-foreground">
                      {mapping.color}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() =>
                      openEditDialog(
                        mapping.systemRole,
                        mapping.discordRoleName,
                        mapping.color
                      )
                    }
                    disabled={isPending}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("editDialog.description", {
                role: t(`systemRoles.${editSystemRole}`),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">{t("fields.discordRoleName")}</Label>
              <Input
                id="role-name"
                value={editRoleName}
                onChange={(e) => setEditRoleName(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-color">{t("fields.color")}</Label>
              <div className="flex items-center gap-3">
                <input
                  id="role-color"
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="size-10 cursor-pointer rounded border border-border"
                  disabled={isPending}
                />
                <Input
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  placeholder="#E74C3C"
                  className="w-28 font-mono"
                  disabled={isPending}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSaveMapping}
              disabled={isPending || !editRoleName.trim()}
            >
              {isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
