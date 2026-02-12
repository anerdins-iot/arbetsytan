"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateNote, type NoteItem } from "@/actions/notes";
import { NOTE_CATEGORIES } from "./notes-tab";

type EditNoteDialogProps = {
  projectId: string;
  note: NoteItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function EditNoteDialog({
  projectId,
  note,
  open,
  onOpenChange,
  onSuccess,
}: EditNoteDialogProps) {
  const t = useTranslations("projects.notes");
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [category, setCategory] = useState<string>(note.category || "");
  const [isPending, startTransition] = useTransition();

  // Uppdatera state när note ändras
  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    setCategory(note.category || "");
  }, [note]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      alert(t("contentRequired"));
      return;
    }

    startTransition(async () => {
      const result = await updateNote(projectId, note.id, {
        title: title.trim() || undefined,
        content: content.trim(),
        category: category || null,
      });

      if (result.success) {
        onOpenChange(false);
        onSuccess();
      } else {
        alert(result.error);
      }
    });
  };

  const handleCancel = () => {
    // Återställ till ursprungliga värden
    setTitle(note.title);
    setContent(note.content);
    setCategory(note.category || "");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("editNote")}</DialogTitle>
            <DialogDescription>{t("editNoteDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">{t("title")}</Label>
              <Input
                id="edit-title"
                placeholder={t("titlePlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-content">
                {t("content")} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-content"
                placeholder={t("contentPlaceholder")}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                maxLength={10000}
                required
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                {content.length} / 10000 {t("characters")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-category">{t("category")}</Label>
              <Select value={category} onValueChange={setCategory} disabled={isPending}>
                <SelectTrigger id="edit-category">
                  <SelectValue placeholder={t("selectCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(`categories.${cat}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isPending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending || !content.trim()}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
