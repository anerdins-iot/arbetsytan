"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Plus, Edit, Trash2, Tag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getNoteCategories,
  createNoteCategory,
  updateNoteCategory,
  deleteNoteCategory,
  type NoteCategoryItem,
} from "@/actions/note-categories";

type NoteCategoryManagerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoriesChanged: () => void;
  /** Incremented by parent when a socket noteCategory event is received */
  socketCategoryVersion?: number;
};

export function NoteCategoryManager({
  open,
  onOpenChange,
  onCategoriesChanged,
  socketCategoryVersion = 0,
}: NoteCategoryManagerProps) {
  const t = useTranslations("projects.notes.categoryManager");
  const [categories, setCategories] = useState<NoteCategoryItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const [editingCategory, setEditingCategory] = useState<NoteCategoryItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [color, setColor] = useState("");

  const loadCategories = () => {
    startTransition(async () => {
      const result = await getNoteCategories();
      if (result.success) {
        setCategories(result.categories);
      }
    });
  };

  useEffect(() => {
    if (open) {
      loadCategories();
    }
  }, [open]);

  // Reload categories when socket event triggers version bump
  useEffect(() => {
    if (socketCategoryVersion > 0 && open) {
      loadCategories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketCategoryVersion]);

  const resetForm = () => {
    setName("");
    setSlug("");
    setColor("");
    setEditingCategory(null);
    setIsCreating(false);
  };

  const handleStartCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const handleStartEdit = (category: NoteCategoryItem) => {
    setName(category.name);
    setSlug(category.slug);
    setColor(category.color || "");
    setEditingCategory(category);
    setIsCreating(false);
  };

  const handleSubmitCreate = () => {
    if (!name.trim()) return;

    startTransition(async () => {
      const result = await createNoteCategory({
        name: name.trim(),
        slug: slug.trim() || undefined,
        color: color.trim() || undefined,
      });

      if (result.success) {
        resetForm();
        loadCategories();
        onCategoriesChanged();
      } else {
        alert(result.error);
      }
    });
  };

  const handleSubmitEdit = () => {
    if (!editingCategory || !name.trim()) return;

    startTransition(async () => {
      const result = await updateNoteCategory(editingCategory.id, {
        name: name.trim(),
        slug: slug.trim() || undefined,
        color: color.trim() || null,
      });

      if (result.success) {
        resetForm();
        loadCategories();
        onCategoriesChanged();
      } else {
        alert(result.error);
      }
    });
  };

  const handleDelete = (category: NoteCategoryItem) => {
    if (!confirm(t("confirmDelete"))) return;

    startTransition(async () => {
      const result = await deleteNoteCategory(category.id);
      if (result.success) {
        loadCategories();
        onCategoriesChanged();
      } else {
        alert(result.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Category list */}
          {categories.length === 0 && !isCreating && !editingCategory ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
              <Tag className="mb-3 size-8 text-muted-foreground" />
              <p className="mb-1 text-sm font-medium text-foreground">{t("noCategories")}</p>
              <p className="mb-3 text-xs text-muted-foreground">{t("noCategoriesDescription")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    {cat.color && (
                      <div
                        className="size-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                    )}
                    <span className="text-sm font-medium">{cat.name}</span>
                    <span className="text-xs text-muted-foreground">({cat.slug})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => handleStartEdit(cat)}
                      disabled={isPending}
                    >
                      <Edit className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      onClick={() => handleDelete(cat)}
                      disabled={isPending}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create/Edit form */}
          {(isCreating || editingCategory) && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="space-y-1.5">
                <Label htmlFor="cat-name" className="text-xs">{t("name")}</Label>
                <Input
                  id="cat-name"
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-slug" className="text-xs">{t("slug")}</Label>
                <Input
                  id="cat-slug"
                  placeholder={t("slugPlaceholder")}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  maxLength={100}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-color" className="text-xs">{t("color")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="cat-color"
                    placeholder="#ff6600"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    maxLength={20}
                    disabled={isPending}
                  />
                  {color && (
                    <div
                      className="size-9 shrink-0 rounded-md border border-border"
                      style={{ backgroundColor: color }}
                    />
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetForm}
                  disabled={isPending}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={editingCategory ? handleSubmitEdit : handleSubmitCreate}
                  disabled={isPending || !name.trim()}
                >
                  {isPending
                    ? editingCategory
                      ? t("saving")
                      : t("creating")
                    : editingCategory
                      ? t("save")
                      : t("create")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {!isCreating && !editingCategory && (
            <Button variant="outline" size="sm" onClick={handleStartCreate} disabled={isPending}>
              <Plus className="mr-2 size-4" />
              {t("create")}
            </Button>
          )}
          <div className="ml-auto">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
