"use client";

import { useTranslations } from "next-intl";
import { Pin, Edit, Trash2, Calendar, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownMessage } from "@/components/ai/markdown-message";
import { type NoteItem } from "@/actions/notes";
import type { NoteCategoryItem } from "@/actions/note-categories";

type NoteDetailDialogProps = {
  note: NoteItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  isPending?: boolean;
  categories: NoteCategoryItem[];
};

export function NoteDetailDialog({
  note,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onTogglePin,
  isPending = false,
  categories,
}: NoteDetailDialogProps) {
  const t = useTranslations("projects.notes");

  if (!note) return null;

  const formattedDate = new Date(note.createdAt).toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              {note.title && (
                <DialogTitle className="text-xl">{note.title}</DialogTitle>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {note.category && (() => {
                  const cat = categories.find((c) => c.slug === note.category);
                  return (
                    <Badge
                      variant="secondary"
                      style={cat?.color ? { backgroundColor: cat.color + "20", color: cat.color, borderColor: cat.color + "40" } : undefined}
                    >
                      {cat?.name ?? note.category}
                    </Badge>
                  );
                })()}
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

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-4 border-b border-border pb-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <User className="size-4" />
            <span>{note.createdBy.name || note.createdBy.email}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="size-4" />
            <span>{formattedDate}</span>
          </div>
        </div>

        {/* Innehåll med markdown-stöd */}
        <div className="min-h-[100px] py-4">
          <MarkdownMessage content={note.content} />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onTogglePin}
            disabled={isPending}
          >
            <Pin className="mr-2 size-4" />
            {note.isPinned ? t("unpin") : t("pin")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onEdit();
            }}
            disabled={isPending}
          >
            <Edit className="mr-2 size-4" />
            {t("edit")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={isPending}
          >
            <Trash2 className="mr-2 size-4" />
            {t("delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
