"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2, ScanText, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export type FileDetailFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl: string;
  downloadUrl: string;
  ocrText?: string | null;
  userDescription?: string | null;
  aiAnalysis?: string | null;
  label?: string | null;
};

const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp)/i;

function isImageFile(type: string, name: string): boolean {
  if (type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp)$/i.test(name);
}

function isPdfFile(type: string, name: string): boolean {
  if (type === "application/pdf") return true;
  return /\.pdf$/i.test(name);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

type FileDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FileDetailFile | null;
  translationNamespace?: "projects.files" | "personal.files";
  onSaved?: () => void;
};

/**
 * Reusable file detail dialog with OCR editing, description, and AI analysis display.
 * Save button calls finalize-file API to update ocrText + userDescription and trigger queueFileAnalysis.
 */
export function FileDetailDialog({
  open,
  onOpenChange,
  file,
  translationNamespace = "projects.files",
  onSaved,
}: FileDetailDialogProps) {
  const t = useTranslations(translationNamespace);
  const [ocrText, setOcrText] = useState(file?.ocrText ?? "");
  const [userDescription, setUserDescription] = useState(
    file?.userDescription ?? ""
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (file) {
      setOcrText(file.ocrText ?? "");
      setUserDescription(file.userDescription ?? "");
    }
  }, [file?.id, file?.ocrText, file?.userDescription]);

  const handleSave = useCallback(async () => {
    if (!file || isSaving) return;
    setIsSaving(true);

    try {
      const res = await fetch("/api/ai/finalize-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: file.id,
          ocrText: ocrText.trim(),
          userDescription: userDescription.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Finalize file failed:", data.error || res.statusText);
      }

      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Error finalizing file:", err);
    } finally {
      setIsSaving(false);
    }
  }, [file, ocrText, userDescription, isSaving, onSaved, onOpenChange]);

  if (!file) return null;

  const isImage = isImageFile(file.type, file.name);
  const isPdf = isPdfFile(file.type, file.name);
  const hasAiAnalysis = !!(file.aiAnalysis || file.label);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0" showCloseButton={false}>
        <div className="flex max-h-[85vh] flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={file.downloadUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="outline" size="sm" type="button">
                  <Download className="mr-2 size-4" />
                  {t("download")}
                </Button>
              </a>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => onOpenChange(false)}
              >
                <X className="size-4" />
                <span className="sr-only">{t("closePreview")}</span>
              </Button>
            </div>
          </div>

          {/* Preview */}
          <div className="overflow-auto bg-muted/30 p-4">
            {isImage ? (
              <img
                src={file.previewUrl}
                alt={file.name}
                className="mx-auto max-h-[50vh] w-auto rounded-md border border-border object-contain"
              />
            ) : isPdf ? (
              <iframe
                title={file.name}
                src={file.previewUrl}
                className="h-[50vh] w-full rounded-md border border-border bg-background"
              />
            ) : (
              <div className="flex h-32 items-center justify-center rounded-md border border-border bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  {file.name}
                </p>
              </div>
            )}
          </div>

          {/* OCR + Description + AI Analysis */}
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto border-t border-border p-4">
            {/* OCR (editable) */}
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <ScanText className="size-4 text-muted-foreground" />
                {t("ocrTitle")}
              </Label>
              <Textarea
                value={ocrText}
                onChange={(e) => setOcrText(e.target.value)}
                placeholder={t("ocrTitle")}
                rows={4}
                className="resize-none text-sm"
              />
            </div>

            {/* User description */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="file-description" className="text-sm font-medium">
                {t("descriptionLabel")}
              </Label>
              <Textarea
                id="file-description"
                value={userDescription}
                onChange={(e) => setUserDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                rows={3}
                className="resize-none text-sm"
              />
            </div>

            {/* AI analysis (read-only) */}
            {hasAiAnalysis && (
              <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
                <p className="text-sm font-medium text-foreground">
                  {t("aiAnalysisTitle")}
                </p>
                {file.label && (
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("aiAnalysisLabel")}: {file.label}
                  </p>
                )}
                {file.aiAnalysis && (
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {file.aiAnalysis}
                  </p>
                )}
              </div>
            )}

            {/* Save button */}
            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("savingFileDetails")}
                  </>
                ) : (
                  t("saveFileDetails")
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
