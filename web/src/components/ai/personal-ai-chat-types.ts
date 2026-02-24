import type { VoiceMode } from "@/components/ai/voice-mode-toggle";
import type { NoteItem } from "@/actions/notes";
import type { PersonalNoteItem } from "@/actions/personal";

export type UploadedFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  status: "uploading" | "analyzing" | "done" | "error";
  error?: string;
  url?: string;
  ocrText?: string | null;
  thumbnailUrl?: string;
};

export type AnalysisFileData = {
  id: string;
  name: string;
  type: string;
  url: string;
  ocrText?: string | null;
  ocrLoading?: boolean;
};

export type NoteListPanelData = {
  notes: (NoteItem | PersonalNoteItem)[];
  count: number;
  projectId?: string;
  projectName?: string;
  isPersonal?: boolean;
};

export type PersonalAiChatProps = {
  /** Kontrollera om chattpanelen är öppen */
  open: boolean;
  /** Callback för att ändra öppet/stängt-tillstånd */
  onOpenChange: (open: boolean) => void;
  /** Projekt-ID från URL (synkas automatiskt) */
  initialProjectId?: string | null;
  /** Renderingsläge: sheet (overlay) eller docked (fast sidebar) */
  mode?: "sheet" | "docked";
  /** Initial voice mode when opening via voice CTA */
  initialVoiceMode?: VoiceMode;
};
