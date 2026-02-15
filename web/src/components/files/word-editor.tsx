"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { FileText, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

type WordEditorProps = {
  fileId: string;
  fileName: string;
  projectId?: string;
  initialContent: string;
  translationNamespace: "projects.files" | "personal.files";
  onSaved?: () => void;
  onClose: () => void;
};

export function WordEditor({
  fileId,
  fileName,
  projectId,
  initialContent,
  translationNamespace,
  onSaved,
  onClose,
}: WordEditorProps) {
  const t = useTranslations(translationNamespace);
  const [content, setContent] = useState(initialContent);
  const [newFileName, setNewFileName] = useState(() => {
    const baseName = fileName.replace(/\.(docx?|doc)$/i, "");
    return `${baseName}-redigerad.docx`;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    if (isSaving || !content.trim()) return;
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/files/save-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFileId: fileId,
          newFileName: newFileName.endsWith(".docx")
            ? newFileName
            : `${newFileName}.docx`,
          content: content.trim(),
          projectId,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "SAVE_FAILED");
        return;
      }

      setSaved(true);
      onSaved?.();
      // Auto-close after short delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error("Error saving Word file:", err);
      setError("SAVE_FAILED");
    } finally {
      setIsSaving(false);
    }
  }, [fileId, content, newFileName, projectId, isSaving, onSaved, onClose]);

  return (
    <div className="flex h-full flex-col">
      {/* Editor header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {t("editDocument")}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* New file name */}
      <div className="border-b border-border px-4 py-3">
        <Label htmlFor="word-new-filename" className="mb-1.5 text-xs font-medium text-muted-foreground">
          {t("saveAsNewFile")}
        </Label>
        <Input
          id="word-new-filename"
          value={newFileName}
          onChange={(e) => setNewFileName(e.target.value)}
          placeholder="dokument.docx"
          className="h-8 text-sm"
        />
      </div>

      {/* Text editor area */}
      <div className="flex-1 overflow-hidden p-4">
        <ScrollArea className="h-full">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("wordEditorPlaceholder")}
            className="min-h-[400px] resize-none font-mono text-sm leading-relaxed"
            rows={20}
          />
        </ScrollArea>
      </div>

      {/* Footer with save button */}
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <div className="text-xs text-muted-foreground">
          {t("wordEditorHint")}
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-destructive">
              {t("wordSaveError")}
            </span>
          )}
          {saved && (
            <span className="text-xs text-green-600 dark:text-green-400">
              {t("wordSaveSuccess")}
            </span>
          )}
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSaving || !content.trim() || saved}
            className="gap-1.5"
          >
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("wordSaving")}
              </>
            ) : (
              <>
                <Save className="size-4" />
                {t("saveAsNewFile")}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
