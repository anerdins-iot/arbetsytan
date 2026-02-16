"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Pin, Edit, Trash2, Calendar, User, Tag, Plus, ChevronDown, ChevronUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { MarkdownMessage } from "@/components/ai/markdown-message";
import { deleteNote, toggleNotePin, updateNote, type NoteItem } from "@/actions/notes";
import {
  createNoteCategory,
  updateNoteCategory,
  deleteNoteCategory,
  type NoteCategoryItem,
} from "@/actions/note-categories";
import { EditNoteDialog } from "./edit-note-dialog";

type NoteDetailModalProps = {
  note: NoteItem;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  categories: NoteCategoryItem[];
};

export function NoteDetailModal({
  note,
  projectId,
  open,
  onOpenChange,
  onUpdate,
  categories,
}: NoteDetailModalProps) {
  const t = useTranslations("projects.notes");
  const tCat = useTranslations("projects.notes.categoryManager");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Category management state
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<NoteCategoryItem | null>(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [categoryColor, setCategoryColor] = useState("");

  // Reset category form when modal closes
  useEffect(() => {
    if (!open) {
      setIsCategoryManagerOpen(false);
      resetCategoryForm();
    }
  }, [open]);

  const resetCategoryForm = () => {
    setCategoryName("");
    setCategorySlug("");
    setCategoryColor("");
    setEditingCategory(null);
    setIsCreatingCategory(false);
  };

  // Toggle pin-status
  const handleTogglePin = () => {
    startTransition(async () => {
      const result = await toggleNotePin(projectId, note.id);
      if (result.success) {
        onUpdate();
      } else {
        alert(result.error);
      }
    });
  };

  // Ta bort anteckning
  const handleDelete = () => {
    if (!confirm(t("confirmDelete"))) return;

    startTransition(async () => {
      const result = await deleteNote(projectId, note.id);
      if (result.success) {
        onOpenChange(false);
        onUpdate();
      } else {
        alert(result.error);
      }
    });
  };

  // Byt kategori direkt
  const handleCategoryChange = (newCategory: string) => {
    startTransition(async () => {
      const result = await updateNote(projectId, note.id, {
        title: note.title || undefined,
        content: note.content,
        category: newCategory === "none" ? null : newCategory,
      });
      if (result.success) {
        onUpdate();
      } else {
        alert(result.error);
      }
    });
  };

  const handleEditSuccess = () => {
    setIsEditDialogOpen(false);
    onUpdate();
  };

  // Category CRUD handlers
  const handleStartCreateCategory = () => {
    resetCategoryForm();
    setIsCreatingCategory(true);
  };

  const handleStartEditCategory = (cat: NoteCategoryItem) => {
    setCategoryName(cat.name);
    setCategorySlug(cat.slug);
    setCategoryColor(cat.color || "");
    setEditingCategory(cat);
    setIsCreatingCategory(false);
  };

  const handleSubmitCategory = () => {
    if (!categoryName.trim()) return;

    startTransition(async () => {
      if (editingCategory) {
        const result = await updateNoteCategory(editingCategory.id, {
          name: categoryName.trim(),
          slug: categorySlug.trim() || undefined,
          color: categoryColor.trim() || null,
        });
        if (result.success) {
          resetCategoryForm();
          onUpdate();
        } else {
          alert(result.error);
        }
      } else {
        const result = await createNoteCategory({
          name: categoryName.trim(),
          slug: categorySlug.trim() || undefined,
          color: categoryColor.trim() || undefined,
        });
        if (result.success) {
          resetCategoryForm();
          onUpdate();
        } else {
          alert(result.error);
        }
      }
    });
  };

  const handleDeleteCategory = (cat: NoteCategoryItem) => {
    if (!confirm(tCat("confirmDelete"))) return;

    startTransition(async () => {
      const result = await deleteNoteCategory(cat.id);
      if (result.success) {
        onUpdate();
      } else {
        alert(result.error);
      }
    });
  };

  // Formatera datum
  const formattedDate = new Date(note.createdAt).toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedTime = new Date(note.createdAt).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Hitta dynamisk kategori-färg
  const categoryMatch = note.category
    ? categories.find((c) => c.slug === note.category)
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="flex-1 space-y-2">
                {note.title && (
                  <DialogTitle className="text-xl font-semibold leading-tight">
                    {note.title}
                  </DialogTitle>
                )}
                {!note.title && (
                  <DialogTitle className="text-lg text-muted-foreground">
                    {t("title")}
                  </DialogTitle>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {note.category && (
                    <Badge
                      variant="secondary"
                      style={
                        categoryMatch?.color
                          ? {
                              backgroundColor: categoryMatch.color + "20",
                              color: categoryMatch.color,
                              borderColor: categoryMatch.color + "40",
                            }
                          : undefined
                      }
                    >
                      {categoryMatch?.name ?? note.category}
                    </Badge>
                  )}
                  {note.isPinned && (
                    <Badge variant="outline" className="gap-1">
                      <Pin className="size-3" />
                      {t("pinned")}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <User className="size-4" />
              <span>{note.createdBy.name || note.createdBy.email}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="size-4" />
              <span>{formattedDate} {formattedTime}</span>
            </div>
          </div>

          <Separator className="my-2" />

          {/* Content area with markdown */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="py-2">
              <MarkdownMessage content={note.content} />
            </div>
          </div>

          <Separator className="my-2" />

          {/* Category selector */}
          <div className="flex-shrink-0 space-y-3">
            <div className="flex items-center gap-3">
              <Label className="flex items-center gap-1.5 text-sm">
                <Tag className="size-4" />
                {t("category")}
              </Label>
              <Select
                value={note.category || "none"}
                onValueChange={handleCategoryChange}
                disabled={isPending}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder={t("selectCategory")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("selectCategory")}</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.slug} value={cat.slug}>
                      <div className="flex items-center gap-2">
                        {cat.color && (
                          <div
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                        )}
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Collapsible category manager */}
            <Collapsible open={isCategoryManagerOpen} onOpenChange={setIsCategoryManagerOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-auto gap-1 p-1 text-xs text-muted-foreground hover:text-foreground">
                  {isCategoryManagerOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  {tCat("title")}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  {/* Category list */}
                  {categories.length === 0 && !isCreatingCategory && !editingCategory ? (
                    <p className="text-center text-xs text-muted-foreground">{tCat("noCategories")}</p>
                  ) : (
                    <div className="mb-2 space-y-1">
                      {categories.map((cat) => (
                        <div
                          key={cat.id}
                          className="flex items-center justify-between rounded px-2 py-1 hover:bg-accent/50"
                        >
                          <div className="flex items-center gap-2">
                            {cat.color && (
                              <div
                                className="size-2.5 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              />
                            )}
                            <span className="text-sm">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6"
                              onClick={() => handleStartEditCategory(cat)}
                              disabled={isPending}
                            >
                              <Edit className="size-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteCategory(cat)}
                              disabled={isPending}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Create/Edit category form */}
                  {(isCreatingCategory || editingCategory) ? (
                    <div className="space-y-2 border-t border-border pt-2">
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          placeholder={tCat("namePlaceholder")}
                          value={categoryName}
                          onChange={(e) => setCategoryName(e.target.value)}
                          maxLength={100}
                          disabled={isPending}
                          className="h-8 text-sm"
                        />
                        <Input
                          placeholder={tCat("slugPlaceholder")}
                          value={categorySlug}
                          onChange={(e) => setCategorySlug(e.target.value)}
                          maxLength={100}
                          disabled={isPending}
                          className="h-8 text-sm"
                        />
                        <div className="flex gap-1">
                          <Input
                            placeholder="#ff6600"
                            value={categoryColor}
                            onChange={(e) => setCategoryColor(e.target.value)}
                            maxLength={20}
                            disabled={isPending}
                            className="h-8 text-sm"
                          />
                          {categoryColor && (
                            <div
                              className="size-8 shrink-0 rounded border border-border"
                              style={{ backgroundColor: categoryColor }}
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={resetCategoryForm}
                          disabled={isPending}
                        >
                          {tCat("cancel")}
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={handleSubmitCategory}
                          disabled={isPending || !categoryName.trim()}
                        >
                          {isPending
                            ? editingCategory ? tCat("saving") : tCat("creating")
                            : editingCategory ? tCat("save") : tCat("create")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 h-7 w-full text-xs"
                      onClick={handleStartCreateCategory}
                      disabled={isPending}
                    >
                      <Plus className="mr-1 size-3" />
                      {tCat("create")}
                    </Button>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <Separator className="my-2" />

          {/* Action buttons */}
          <div className="flex flex-shrink-0 items-center justify-between gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash2 className="mr-2 size-4" />
              {t("delete")}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTogglePin}
                disabled={isPending}
              >
                <Pin className="mr-2 size-4" />
                {note.isPinned ? t("unpin") : t("pin")}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsEditDialogOpen(true)}
                disabled={isPending}
              >
                <Edit className="mr-2 size-4" />
                {t("edit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <EditNoteDialog
        projectId={projectId}
        note={note}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSuccess={handleEditSuccess}
        categories={categories}
      />
    </>
  );
}
