"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pin, Edit, Trash2, MoreVertical } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteNote, toggleNotePin, type NoteItem } from "@/actions/notes";
import type { NoteCategoryItem } from "@/actions/note-categories";
import { EditNoteDialog } from "./edit-note-dialog";

type NoteCardProps = {
  note: NoteItem;
  projectId: string;
  onUpdate: () => void;
  categories: NoteCategoryItem[];
};

export function NoteCard({ note, projectId, onUpdate, categories }: NoteCardProps) {
  const t = useTranslations("projects.notes");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

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
        onUpdate();
      } else {
        alert(result.error);
      }
    });
  };

  // Trunkera innehållet till 150 tecken
  const truncatedContent =
    note.content.length > 150 ? note.content.substring(0, 150) + "..." : note.content;

  // Formatera datum
  const formattedDate = new Date(note.createdAt).toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Hitta dynamisk kategori-färg
  const categoryMatch = note.category
    ? categories.find((c) => c.slug === note.category)
    : null;

  return (
    <>
      <Card className="relative flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              {note.title && (
                <h3 className="mb-1 font-semibold text-foreground line-clamp-2">{note.title}</h3>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" disabled={isPending}>
                  <MoreVertical className="size-4" />
                  <span className="sr-only">{t("actions")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleTogglePin}>
                  <Pin className="mr-2 size-4" />
                  {note.isPinned ? t("unpin") : t("pin")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
                  <Edit className="mr-2 size-4" />
                  {t("edit")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="mr-2 size-4" />
                  {t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="flex-1 pb-3">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{truncatedContent}</p>
        </CardContent>
        <CardFooter className="pt-0 text-xs text-muted-foreground">
          <div className="flex w-full items-center justify-between">
            <span>{note.createdBy.name || note.createdBy.email}</span>
            <span>{formattedDate}</span>
          </div>
        </CardFooter>
      </Card>

      {/* Edit dialog */}
      <EditNoteDialog
        projectId={projectId}
        note={note}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onSuccess={onUpdate}
        categories={categories}
      />
    </>
  );
}
