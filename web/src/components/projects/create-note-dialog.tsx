"use client";

import { useState, useTransition } from "react";
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
import { createNote } from "@/actions/notes";
import { NOTE_CATEGORIES } from "./notes-tab";

type CreateNoteDialogProps = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function CreateNoteDialog({
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: CreateNoteDialogProps) {
  const t = useTranslations("projects.notes");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      alert(t("contentRequired"));
      return;
    }

    startTransition(async () => {
      const result = await createNote(projectId, {
        title: title.trim() || undefined,
        content: content.trim(),
        category: category || undefined,
      });

      if (result.success) {
        // Återställ formuläret
        setTitle("");
        setContent("");
        setCategory("");
        onOpenChange(false);
        onSuccess();
      } else {
        alert(result.error);
      }
    });
  };

  const handleCancel = () => {
    setTitle("");
    setContent("");
    setCategory("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("createNote")}</DialogTitle>
            <DialogDescription>{t("createNoteDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t("title")}</Label>
              <Input
                id="title"
                placeholder={t("titlePlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">
                {t("content")} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="content"
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
              <Label htmlFor="category">{t("category")}</Label>
              <Select value={category} onValueChange={setCategory} disabled={isPending}>
                <SelectTrigger id="category">
                  <SelectValue placeholder={t("selectCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(`category.${cat}`)}
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
              {isPending ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
