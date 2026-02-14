"use client";

import { useTranslations } from "next-intl";
import { FileText, FolderOpen } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PersonalNoteItem, PersonalFileItem } from "@/actions/personal";

type PersonalOverviewProps = {
  notes: PersonalNoteItem[];
  files: PersonalFileItem[];
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PersonalOverview({ notes, files }: PersonalOverviewProps) {
  const t = useTranslations("personal.overview");
  const recentNotes = notes.slice(0, 5);
  const recentFiles = files.slice(0, 5);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Recent notes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-medium">
            {t("recentNotes")}
          </CardTitle>
          {notes.length > 5 && (
            <SeeAllButton tab="notes" label={t("seeAll")} />
          )}
        </CardHeader>
        <CardContent>
          {recentNotes.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <FileText className="mb-3 size-10 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                {t("emptyNotes")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("emptyNotesDescription")}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentNotes.map((note) => (
                <li key={note.id} className="rounded-md border border-border p-3">
                  {note.title && (
                    <p className="mb-0.5 text-sm font-medium text-card-foreground">
                      {note.title}
                    </p>
                  )}
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {note.content}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(note.createdAt).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Recent files */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-medium">
            {t("recentFiles")}
          </CardTitle>
          {files.length > 5 && (
            <SeeAllButton tab="files" label={t("seeAll")} />
          )}
        </CardHeader>
        <CardContent>
          {recentFiles.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <FolderOpen className="mb-3 size-10 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                {t("emptyFiles")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("emptyFilesDescription")}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentFiles.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between rounded-md border border-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)} &middot;{" "}
                      {new Date(file.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * "See all" button that switches tab via URL search param.
 * Uses a simple link to ?tab=<tab> which the page reads.
 */
function SeeAllButton({ tab, label }: { tab: string; label: string }) {
  return (
    <Button variant="ghost" size="sm" asChild>
      <a href={`?tab=${tab}`}>{label}</a>
    </Button>
  );
}
