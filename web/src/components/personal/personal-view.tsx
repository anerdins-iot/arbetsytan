"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSocket } from "@/hooks/use-socket";
import { PersonalOverview } from "./personal-overview";
import { PersonalNotesTab } from "./personal-notes-tab";
import { PersonalFilesTab } from "./personal-files-tab";
import type { PersonalNoteItem, PersonalFileItem } from "@/actions/personal";

type PersonalViewProps = {
  notes: PersonalNoteItem[];
  files: PersonalFileItem[];
  initialTab?: "overview" | "notes" | "files";
};

export function PersonalView({
  notes,
  files,
  initialTab = "overview",
}: PersonalViewProps) {
  const t = useTranslations("personal");
  const [socketNoteVersion, setSocketNoteVersion] = useState(0);

  const handlePersonalNoteEvent = useCallback((payload: { projectId?: string | null }) => {
    if (payload.projectId == null) {
      setSocketNoteVersion((v) => v + 1);
    }
  }, []);

  useSocket({
    enabled: true,
    onNoteCreated: handlePersonalNoteEvent,
    onNoteUpdated: handlePersonalNoteEvent,
    onNoteDeleted: handlePersonalNoteEvent,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <Tabs defaultValue={initialTab}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="overview">
              {t("tabs.overview")}
            </TabsTrigger>
            <TabsTrigger value="notes">
              {t("tabs.notes")}
            </TabsTrigger>
            <TabsTrigger value="files">
              {t("tabs.files")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-6">
          <PersonalOverview notes={notes} files={files} />
        </TabsContent>

        <TabsContent value="notes" className="mt-6">
          <PersonalNotesTab initialNotes={notes} socketNoteVersion={socketNoteVersion} />
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <PersonalFilesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
