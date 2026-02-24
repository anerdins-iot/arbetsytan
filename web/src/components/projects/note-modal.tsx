"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Pin, Edit, Trash2, Calendar, User, Tag, Plus, ChevronDown, ChevronUp, Save, X, Eye, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownMessage } from "@/components/ai/markdown-message";
import { createNote, deleteNote, toggleNotePin, updateNote, type NoteItem } from "@/actions/notes";
import {
  createNoteCategory,
  updateNoteCategory,
  deleteNoteCategory,
  type NoteCategoryItem,
} from "@/actions/note-categories";
import {
  createPersonalNote,
  deletePersonalNote,
  togglePersonalNotePin,
  updatePersonalNote,
  type PersonalNoteItem,
} from "@/actions/personal";
import { NoteAttachments } from "./note-attachments";

type NoteModalMode = "view" | "create" | "edit";

type NoteModalProps = {
  /** null = personal notes (Mitt utrymme) */
  projectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  categories: NoteCategoryItem[];
  /** Note to view/edit. If undefined, modal is in create mode */
  note?: NoteItem | PersonalNoteItem;
  /** Initial mode. Defaults to "view" if note exists, "create" otherwise */
  initialMode?: NoteModalMode;
};

export function NoteModal({
  projectId,
  open,
  onOpenChange,
  onUpdate,
  categories,
  note,
  initialMode,
}: NoteModalProps) {
  const t = useTranslations("projects.notes");
  const tCat = useTranslations("projects.notes.categoryManager");
  const [isPending, startTransition] = useTransition();

  // Determine mode
  const [mode, setMode] = useState<NoteModalMode>(initialMode ?? (note ? "view" : "create"));

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("");

  // Category management state
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<NoteCategoryItem | null>(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [categoryColor, setCategoryColor] = useState("");

  // Preview tab for create/edit mode
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");

  // Reset form when modal opens/closes or note changes
  useEffect(() => {
    if (open) {
      if (note) {
        setTitle(note.title || "");
        setContent(note.content);
        setCategory(note.category || "");
        setMode(initialMode ?? "view");
      } else {
        setTitle("");
        setContent("");
        setCategory("");
        setMode("create");
      }
      setActiveTab("write");
      setIsCategoryManagerOpen(false);
      resetCategoryForm();
    }
  }, [open, note, initialMode]);

  const resetCategoryForm = () => {
    setCategoryName("");
    setCategorySlug("");
    setCategoryColor("");
    setEditingCategory(null);
    setIsCreatingCategory(false);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const isPersonal = projectId === null;

  // Create note
  const handleCreate = () => {
    if (!content.trim()) {
      alert(t("contentRequired"));
      return;
    }

    startTransition(async () => {
      const result = isPersonal
        ? await createPersonalNote({
            title: title.trim() || undefined,
            content: content.trim(),
            category: category || undefined,
          })
        : await createNote(projectId, {
            title: title.trim() || undefined,
            content: content.trim(),
            category: category || undefined,
          });

      if (result.success) {
        onOpenChange(false);
        onUpdate();
      } else {
        alert(result.error);
      }
    });
  };

  // Update note
  const handleUpdate = () => {
    if (!note || !content.trim()) {
      alert(t("contentRequired"));
      return;
    }

    startTransition(async () => {
      const result = isPersonal
        ? await updatePersonalNote(note.id, {
            title: title.trim() || undefined,
            content: content.trim(),
            category: category || null,
          })
        : await updateNote(projectId, note.id, {
            title: title.trim() || undefined,
            content: content.trim(),
            category: category || null,
          });

      if (result.success) {
        setMode("view");
        onUpdate();
      } else {
        alert(result.error);
      }
    });
  };

  // Toggle pin
  const handleTogglePin = () => {
    if (!note) return;
    startTransition(async () => {
      const result = isPersonal
        ? await togglePersonalNotePin(note.id)
        : await toggleNotePin(projectId, note.id);
      if (result.success) {
        onUpdate();
      } else {
        alert(result.error);
      }
    });
  };

  // Delete note
  const handleDelete = () => {
    if (!note || !confirm(t("confirmDelete"))) return;

    startTransition(async () => {
      const result = isPersonal
        ? await deletePersonalNote(note.id)
        : await deleteNote(projectId, note.id);
      if (result.success) {
        onOpenChange(false);
        onUpdate();
      } else {
        alert(result.error);
      }
    });
  };

  // Change category (in view mode)
  const handleCategoryChange = (newCategory: string) => {
    if (!note) return;
    startTransition(async () => {
      const result = isPersonal
        ? await updatePersonalNote(note.id, {
            title: note.title || undefined,
            content: note.content,
            category: newCategory === "none" ? null : newCategory,
          })
        : await updateNote(projectId, note.id, {
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

  // Format date for view mode
  const formattedDate = note
    ? new Date(note.createdAt).toLocaleDateString("sv-SE", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  const formattedTime = note
    ? new Date(note.createdAt).toLocaleTimeString("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  // Find category match for badge color
  const categoryMatch = (note?.category || category)
    ? categories.find((c) => c.slug === (note?.category || category))
    : null;

  // Category manager component (shared between modes)
  const CategoryManager = () => (
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
  );

  // VIEW MODE
  if (mode === "view" && note) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="flex-1 space-y-2">
                {note.title ? (
                  <DialogTitle className="text-xl font-semibold leading-tight">
                    {note.title}
                  </DialogTitle>
                ) : (
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
            {!isPersonal && "createdBy" in note && (
              <div className="flex items-center gap-1.5">
                <User className="size-4" />
                <span>{note.createdBy.name || note.createdBy.email}</span>
              </div>
            )}
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

          {/* Attachments */}
          <div className="flex-shrink-0">
            <NoteAttachments
              projectId={projectId}
              noteId={note.id}
              editable={true}
            />
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
            <CategoryManager />
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
                onClick={() => setMode("edit")}
                disabled={isPending}
              >
                <Pencil className="mr-2 size-4" />
                {t("edit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // CREATE / EDIT MODE
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {mode === "create" ? t("createNote") : t("editNote")}
          </DialogTitle>
          <DialogDescription>
            {mode === "create" ? t("createNoteDescription") : t("editNoteDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="note-title">{t("title")}</Label>
            <Input
              id="note-title"
              placeholder={t("titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={isPending}
            />
          </div>

          {/* Content with preview tabs */}
          <div className="space-y-2">
            <Label>
              {t("content")} <span className="text-destructive">*</span>
            </Label>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "write" | "preview")}>
              <TabsList className="mb-2">
                <TabsTrigger value="write" className="gap-1.5">
                  <Pencil className="size-3" />
                  {t("edit")}
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-1.5">
                  <Eye className="size-3" />
                  {t("preview") || "Förhandsgranska"}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="write" className="mt-0">
                <Textarea
                  placeholder={t("contentPlaceholder")}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={10}
                  maxLength={10000}
                  disabled={isPending}
                  className="min-h-[200px] font-mono text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {content.length} / 10000 {t("characters")} • Markdown stöds
                </p>
              </TabsContent>
              <TabsContent value="preview" className="mt-0">
                <div className="min-h-[200px] rounded-md border border-border bg-muted/30 p-4">
                  {content.trim() ? (
                    <MarkdownMessage content={content} />
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      {t("contentPlaceholder")}
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Category */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Label className="flex items-center gap-1.5">
                <Tag className="size-4" />
                {t("category")}
              </Label>
              <Select
                value={category || "none"}
                onValueChange={(v) => setCategory(v === "none" ? "" : v)}
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
            <CategoryManager />
          </div>

          {/* Attachments (only in edit mode, when note already exists) */}
          {mode === "edit" && note && (
            <NoteAttachments
              projectId={projectId}
              noteId={note.id}
              editable={true}
              onInsertImage={(markdown) => {
                setContent((prev) => prev + "\n" + markdown);
              }}
            />
          )}
        </div>

        <Separator className="my-2" />

        {/* Action buttons */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2">
          {mode === "edit" && note ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTitle(note.title || "");
                  setContent(note.content);
                  setCategory(note.category || "");
                  setMode("view");
                }}
                disabled={isPending}
              >
                {t("cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleUpdate}
                disabled={isPending || !content.trim()}
              >
                <Save className="mr-2 size-4" />
                {isPending ? t("saving") : t("save")}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                disabled={isPending}
              >
                {t("cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleCreate}
                disabled={isPending || !content.trim()}
              >
                <Plus className="mr-2 size-4" />
                {isPending ? t("creating") : t("create")}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
