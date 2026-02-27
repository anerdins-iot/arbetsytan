"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  createDiscordCategory,
  updateDiscordCategory,
  deleteDiscordCategory,
  syncCategories,
  createDiscordChannel,
  renameDiscordChannel,
  deleteDiscordChannel,
  type DiscordCategoryData,
  type DiscordChannelData,
} from "@/actions/discord";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Hash,
  Volume2,
  Megaphone,
} from "lucide-react";

type CategoryManagerProps = {
  categories: DiscordCategoryData[];
};

const CATEGORY_TYPES = [
  "PROJECTS",
  "SUPPORT",
  "GENERAL",
  "WELCOME",
  "CUSTOM",
] as const;

const CHANNEL_TYPES = ["text", "voice", "announcement"] as const;

function ChannelTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "voice":
      return <Volume2 className="size-4 text-muted-foreground" />;
    case "announcement":
      return <Megaphone className="size-4 text-muted-foreground" />;
    default:
      return <Hash className="size-4 text-muted-foreground" />;
  }
}

// --- Channel List Component ---

function CategoryChannels({
  category,
  isPending,
  startTransition,
  onSuccess,
  onError,
}: {
  category: DiscordCategoryData;
  isPending: boolean;
  startTransition: (callback: () => void) => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations("settings.discord.categories.channels");
  const router = useRouter();

  // Create channel dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<string>("text");

  // Rename channel dialog
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameChannel, setRenameChannel] = useState<DiscordChannelData | null>(
    null
  );
  const [renameValue, setRenameValue] = useState("");

  // Delete confirmation dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteChannel, setDeleteChannel] =
    useState<DiscordChannelData | null>(null);

  function handleCreateChannel() {
    startTransition(async () => {
      const result = await createDiscordChannel({
        categoryId: category.id,
        name: newChannelName,
        channelType: newChannelType,
      });
      if (result.success) {
        setCreateOpen(false);
        setNewChannelName("");
        setNewChannelType("text");
        onSuccess(t("saved"));
        router.refresh();
      } else if (result.error === "CATEGORY_NOT_FOUND") {
        onError(t("errors.categoryNotFound"));
      } else {
        onError(t("errors.createFailed"));
      }
    });
  }

  function handleRenameChannel() {
    if (!renameChannel) return;
    startTransition(async () => {
      const result = await renameDiscordChannel({
        id: renameChannel.id,
        name: renameValue,
      });
      if (result.success) {
        setRenameOpen(false);
        setRenameChannel(null);
        onSuccess(t("saved"));
        router.refresh();
      } else {
        onError(t("errors.renameFailed"));
      }
    });
  }

  function handleDeleteChannel() {
    if (!deleteChannel) return;
    startTransition(async () => {
      const result = await deleteDiscordChannel(deleteChannel.id);
      if (result.success) {
        setDeleteOpen(false);
        setDeleteChannel(null);
        onSuccess(t("deleted"));
        router.refresh();
      } else {
        onError(t("errors.deleteFailed"));
      }
    });
  }

  function openRenameDialog(channel: DiscordChannelData) {
    setRenameChannel(channel);
    setRenameValue(channel.name);
    setRenameOpen(true);
  }

  function openDeleteDialog(channel: DiscordChannelData) {
    setDeleteChannel(channel);
    setDeleteOpen(true);
  }

  return (
    <div className="border-t bg-muted/30 px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">
          {t("title")} ({category.channels.length})
        </h4>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <Plus className="mr-1 size-3" />
              {t("createButton")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("createDialog.title")}</DialogTitle>
              <DialogDescription>
                {t("createDialog.description")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor={`channel-name-${category.id}`}>
                  {t("fields.name")}
                </Label>
                <Input
                  id={`channel-name-${category.id}`}
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder={t("fields.namePlaceholder")}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`channel-type-${category.id}`}>
                  {t("fields.type")}
                </Label>
                <Select value={newChannelType} onValueChange={setNewChannelType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNEL_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`channelTypes.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={isPending}
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleCreateChannel}
                disabled={isPending || !newChannelName.trim()}
              >
                {isPending ? t("creating") : t("create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {category.channels.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-1">
          {category.channels.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center justify-between rounded-md border bg-background px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ChannelTypeIcon type={channel.channelType} />
                <span className="text-sm font-medium truncate">
                  {channel.name}
                </span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {t(`channelTypes.${channel.channelType}`)}
                </Badge>
                {channel.discordChannelId ? (
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                    {channel.discordChannelId}
                  </span>
                ) : (
                  <Badge variant="outline" className="text-xs shrink-0">
                    {t("notSynced")}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => openRenameDialog(channel)}
                  disabled={isPending}
                  title={t("rename")}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() => openDeleteDialog(channel)}
                  disabled={isPending}
                  title={t("delete")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rename Channel Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("renameDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("renameDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-channel-name">{t("fields.name")}</Label>
              <Input
                id="rename-channel-name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameOpen(false)}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleRenameChannel}
              disabled={isPending || !renameValue.trim()}
            >
              {isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Channel Confirmation Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialog.description", {
                name: deleteChannel?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteChannel}
              disabled={isPending}
            >
              {isPending ? t("deleting") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// --- Main CategoryManager ---

export function CategoryManager({ categories }: CategoryManagerProps) {
  const t = useTranslations("settings.discord.categories");
  const tc = useTranslations("settings.discord.categories.channels");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Track which categories are expanded
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  // Create dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>("CUSTOM");

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<DiscordCategoryData | null>(
    null
  );
  const [editName, setEditName] = useState("");

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  function toggleCategory(id: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleCreate() {
    clearMessages();

    startTransition(async () => {
      const result = await createDiscordCategory({
        name: newName,
        type: newType,
      });
      if (result.success) {
        setCreateDialogOpen(false);
        setNewName("");
        setNewType("CUSTOM");
        setSuccess(t("saved"));
        router.refresh();
      } else if (result.error === "DUPLICATE_TYPE") {
        setError(t("errors.duplicateType"));
      } else {
        setError(t("errors.createFailed"));
      }
    });
  }

  function handleEdit() {
    if (!editCategory) return;
    clearMessages();

    startTransition(async () => {
      const result = await updateDiscordCategory({
        id: editCategory.id,
        name: editName,
      });
      if (result.success) {
        setEditDialogOpen(false);
        setEditCategory(null);
        setSuccess(t("saved"));
        router.refresh();
      } else {
        setError(t("errors.updateFailed"));
      }
    });
  }

  function handleDelete(id: string) {
    clearMessages();

    startTransition(async () => {
      const result = await deleteDiscordCategory(id);
      if (result.success) {
        setSuccess(t("saved"));
        router.refresh();
      } else {
        setError(t("errors.deleteFailed"));
      }
    });
  }

  function handleSyncCategories() {
    clearMessages();

    startTransition(async () => {
      const result = await syncCategories();
      if (result.success) {
        setSuccess(t("saved"));
        router.refresh();
      } else if (result.error === "DISCORD_NOT_CONNECTED") {
        setError(t("errors.notConnected"));
      } else if (result.error === "NO_CATEGORIES") {
        setError(t("errors.noCategories"));
      } else {
        setError(t("errors.syncFailed"));
      }
    });
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const current = categories[index];
    const above = categories[index - 1];

    startTransition(async () => {
      await updateDiscordCategory({
        id: current.id,
        name: current.name,
        sortOrder: above.sortOrder,
      });
      await updateDiscordCategory({
        id: above.id,
        name: above.name,
        sortOrder: current.sortOrder,
      });
      router.refresh();
    });
  }

  function handleMoveDown(index: number) {
    if (index === categories.length - 1) return;
    const current = categories[index];
    const below = categories[index + 1];

    startTransition(async () => {
      await updateDiscordCategory({
        id: current.id,
        name: current.name,
        sortOrder: below.sortOrder,
      });
      await updateDiscordCategory({
        id: below.id,
        name: below.name,
        sortOrder: current.sortOrder,
      });
      router.refresh();
    });
  }

  function openEditDialog(category: DiscordCategoryData) {
    setEditCategory(category);
    setEditName(category.name);
    setEditDialogOpen(true);
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
          {success}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncCategories}
            disabled={isPending || categories.length === 0}
          >
            <RefreshCw
              className={`mr-2 size-4 ${isPending ? "animate-spin" : ""}`}
            />
            {t("syncButton")}
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 size-4" />
                {t("createButton")}
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("createDialog.title")}</DialogTitle>
              <DialogDescription>
                {t("createDialog.description")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">{t("fields.name")}</Label>
                <Input
                  id="category-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("fields.namePlaceholder")}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category-type">{t("fields.type")}</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`types.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={isPending}
              >
                {t("cancel")}
              </Button>
              <Button onClick={handleCreate} disabled={isPending || !newName.trim()}>
                {isPending ? t("creating") : t("create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {categories.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {categories.map((category, index) => {
            const isExpanded = expandedCategories.has(category.id);

            return (
              <Collapsible
                key={category.id}
                open={isExpanded}
                onOpenChange={() => toggleCategory(category.id)}
              >
                <div className="overflow-hidden rounded-lg border">
                  {/* Category row */}
                  <div className="flex items-center gap-2 bg-background px-3 py-2.5">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>

                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <span className="font-medium truncate">
                        {category.name}
                      </span>
                      <Badge variant="secondary" className="shrink-0">
                        {t(`types.${category.type}`)}
                      </Badge>
                      {category.discordCategoryId ? (
                        <Badge
                          variant="default"
                          className="bg-green-600 shrink-0"
                        >
                          {t("synced")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0">
                          {t("notSynced")}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground shrink-0">
                        {tc("channelCount", {
                          count: category.channels.length,
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveUp(index);
                        }}
                        disabled={isPending || index === 0}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveDown(index);
                        }}
                        disabled={
                          isPending || index === categories.length - 1
                        }
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(category);
                        }}
                        disabled={isPending}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(category.id);
                        }}
                        disabled={isPending}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Channels panel (collapsible) */}
                  <CollapsibleContent>
                    <CategoryChannels
                      category={category}
                      isPending={isPending}
                      startTransition={startTransition}
                      onSuccess={(msg) => {
                        clearMessages();
                        setSuccess(msg);
                      }}
                      onError={(msg) => {
                        clearMessages();
                        setError(msg);
                      }}
                    />
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Edit Category Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("editDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-category-name">{t("fields.name")}</Label>
              <Input
                id="edit-category-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={isPending}
              />
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
            <Button onClick={handleEdit} disabled={isPending || !editName.trim()}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
