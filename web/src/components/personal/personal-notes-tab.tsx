"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, Search, Pin, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getPersonalNotes, type PersonalNoteItem } from "@/actions/personal";
import { getNoteCategories, type NoteCategoryItem } from "@/actions/note-categories";
import { NoteCard } from "@/components/projects/note-card";
import { NoteModal } from "@/components/projects/note-modal";
import { NoteCategoryManager } from "@/components/projects/note-category-manager";

type PersonalNotesTabProps = {
  initialNotes?: PersonalNoteItem[];
  /** Incremented by parent when a socket personal-note event is received */
  socketNoteVersion?: number;
};

export function PersonalNotesTab({ initialNotes = [], socketNoteVersion = 0 }: PersonalNotesTabProps) {
  const t = useTranslations("personal.notes");
  const [notes, setNotes] = useState<PersonalNoteItem[]>(initialNotes);
  const [categories, setCategories] = useState<NoteCategoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadCategories = () => {
    startTransition(async () => {
      const result = await getNoteCategories();
      if (result.success) {
        setCategories(result.categories);
      }
    });
  };

  const loadNotes = () => {
    startTransition(async () => {
      const options: { category?: string; search?: string } = {};
      if (categoryFilter !== "all") {
        options.category = categoryFilter;
      }
      if (searchQuery.trim()) {
        options.search = searchQuery;
      }

      const result = await getPersonalNotes(options);
      if (result.success) {
        setNotes(result.notes);
      }
    });
  };

  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, searchQuery]);

  useEffect(() => {
    if (socketNoteVersion > 0) {
      loadNotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketNoteVersion]);

  const handleUpdate = () => {
    loadNotes();
    loadCategories();
  };

  const filteredNotes = notes;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("filterCategory")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("categoryAll")}</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.slug} value={cat.slug}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsCategoryManagerOpen(true)}
            title={t("categoryManager.title")}
          >
            <Settings className="size-4" />
          </Button>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="mr-2 size-4" />
          {t("createNote")}
        </Button>
      </div>

      {isPending ? (
        <div className="flex h-32 items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
          <Pin className="mb-4 size-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold text-foreground">
            {searchQuery || categoryFilter !== "all" ? t("noNotesFiltered") : t("noNotes")}
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {searchQuery || categoryFilter !== "all"
              ? t("noNotesFilteredDescription")
              : t("noNotesDescription")}
          </p>
          {!searchQuery && categoryFilter === "all" && (
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="mr-2 size-4" />
              {t("createFirstNote")}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              projectId={null}
              onUpdate={handleUpdate}
              categories={categories}
            />
          ))}
        </div>
      )}

      <NoteModal
        projectId={null}
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onUpdate={handleUpdate}
        categories={categories}
      />

      <NoteCategoryManager
        open={isCategoryManagerOpen}
        onOpenChange={setIsCategoryManagerOpen}
        onCategoriesChanged={loadCategories}
      />
    </div>
  );
}
