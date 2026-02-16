"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [socketNoteVersion, setSocketNoteVersion] = useState(0);
  const [socketFileVersion, setSocketFileVersion] = useState(0);

  const handlePersonalNoteEvent = useCallback((payload: { projectId?: string | null }) => {
    if (payload.projectId == null) {
      setSocketNoteVersion((v) => v + 1);
    }
  }, []);

  const handlePersonalFileEvent = useCallback((payload: { projectId?: string | null }) => {
    if (payload.projectId == null) {
      setSocketFileVersion((v) => v + 1);
    }
  }, []);

  useSocketEvent(SOCKET_EVENTS.noteCreated, handlePersonalNoteEvent);
  useSocketEvent(SOCKET_EVENTS.noteUpdated, handlePersonalNoteEvent);
  useSocketEvent(SOCKET_EVENTS.noteDeleted, handlePersonalNoteEvent);
  useSocketEvent(SOCKET_EVENTS.fileCreated, handlePersonalFileEvent);
  useSocketEvent(SOCKET_EVENTS.fileUpdated, handlePersonalFileEvent);
  useSocketEvent(SOCKET_EVENTS.fileDeleted, handlePersonalFileEvent);

  // When on overview tab, refresh server data so "Senaste anteckningar" / "Senaste filer" update in real time
  useEffect(() => {
    if (activeTab === "overview" && (socketNoteVersion > 0 || socketFileVersion > 0)) {
      router.refresh();
    }
  }, [activeTab, socketNoteVersion, socketFileVersion, router]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
          <PersonalFilesTab socketFileVersion={socketFileVersion} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
