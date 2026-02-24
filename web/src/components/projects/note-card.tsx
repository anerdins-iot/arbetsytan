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
import {
  deletePersonalNote,
  togglePersonalNotePin,
  type PersonalNoteItem,
} from "@/actions/personal";
import { NoteModal } from "./note-modal";
import { NoteCardMarkdown } from "./note-card-markdown";

type NoteCardProps = {
  note: NoteItem | PersonalNoteItem;
  /** null = personal notes (Mitt utrymme) */
  projectId: string | null;
  onUpdate: () => void;
  categories: NoteCategoryItem[];
};

export function NoteCard({ note, projectId, onUpdate, categories }: NoteCardProps) {
  const t = useTranslations("projects.notes");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"view" | "edit">("view");
  const [isPending, startTransition] = useTransition();
  const isPersonal = projectId === null;

  // Toggle pin-status
  const handleTogglePin = (e?: React.MouseEvent) => {
    e?.stopPropagation();
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

  // Ta bort anteckning
  const handleDelete = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(t("confirmDelete"))) return;

    startTransition(async () => {
      const result = isPersonal
        ? await deletePersonalNote(note.id)
        : await deleteNote(projectId, note.id);
      if (result.success) {
        onUpdate();
      } else {
        alert(result.error);
      }
    });
  };

  const openModal = (mode: "view" | "edit" = "view") => {
    setModalMode(mode);
    setIsModalOpen(true);
  };

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
      <Card
        className="relative flex h-[200px] cursor-pointer flex-col transition-colors hover:bg-accent/50"
        onClick={() => openModal("view")}
      >
        <CardHeader className="flex-shrink-0 px-3 pt-2.5 pb-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {note.title && (
                <h3 className="truncate text-sm font-semibold text-foreground">{note.title}</h3>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {note.category && (
                  <Badge
                    variant="secondary"
                    className="text-xs"
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
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Pin className="size-3" />
                  </Badge>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="flex-shrink-0" disabled={isPending}>
                  <MoreVertical className="size-4" />
                  <span className="sr-only">{t("actions")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleTogglePin(); }}>
                  <Pin className="mr-2 size-4" />
                  {note.isPinned ? t("unpin") : t("pin")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openModal("edit"); }}>
                  <Edit className="mr-2 size-4" />
                  {t("edit")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(); }} className="text-destructive">
                  <Trash2 className="mr-2 size-4" />
                  {t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-hidden px-3 py-1.5">
          <NoteCardMarkdown content={note.content} />
        </CardContent>
        <CardFooter className="flex-shrink-0 px-3 pb-2 pt-0 text-xs text-muted-foreground">
          <div className="flex w-full items-center justify-between">
            <span className="truncate">
              {isPersonal ? null : "createdBy" in note ? (note.createdBy.name || note.createdBy.email) : null}
            </span>
            <span className="flex-shrink-0">{formattedDate}</span>
          </div>
        </CardFooter>
      </Card>

      {/* Universal note modal */}
      <NoteModal
        projectId={projectId}
        note={note}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onUpdate={onUpdate}
        categories={categories}
        initialMode={modalMode}
      />
    </>
  );
}
