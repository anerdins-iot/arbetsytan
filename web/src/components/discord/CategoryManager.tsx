"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  createDiscordCategory,
  updateDiscordCategory,
  deleteDiscordCategory,
  type DiscordCategoryData,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function CategoryManager({ categories }: CategoryManagerProps) {
  const t = useTranslations("settings.discord.categories");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  function handleCreate() {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await createDiscordCategory({
        name: newName,
        type: newType,
      });
      if (result.success) {
        setCreateDialogOpen(false);
        setNewName("");
        setNewType("CUSTOM");
        setSuccess(true);
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
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await updateDiscordCategory({
        id: editCategory.id,
        name: editName,
      });
      if (result.success) {
        setEditDialogOpen(false);
        setEditCategory(null);
        setSuccess(true);
        router.refresh();
      } else {
        setError(t("errors.updateFailed"));
      }
    });
  }

  function handleDelete(id: string) {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await deleteDiscordCategory(id);
      if (result.success) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(t("errors.deleteFailed"));
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
          {t("saved")}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
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

      {categories.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.type")}</TableHead>
                <TableHead>{t("columns.synced")}</TableHead>
                <TableHead className="text-right">{t("columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category, index) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t(`types.${category.type}`)}</Badge>
                  </TableCell>
                  <TableCell>
                    {category.discordCategoryId ? (
                      <Badge variant="default" className="bg-green-600">
                        {t("synced")}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{t("notSynced")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => handleMoveUp(index)}
                        disabled={isPending || index === 0}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => handleMoveDown(index)}
                        disabled={isPending || index === categories.length - 1}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEditDialog(category)}
                        disabled={isPending}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(category.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Dialog */}
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
