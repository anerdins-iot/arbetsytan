"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { FileText, CheckCircle2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { OcrEditor } from "@/components/ai/ocr-editor";

const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp)/i;

type FileReviewResult = {
  ocrText: string;
  userDescription: string;
  skipped: boolean;
};

type OcrReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: {
    id: string;
    name: string;
    type: string;
    url: string;
    ocrText?: string | null;
    ocrLoading?: boolean;
  };
  onComplete: (result: FileReviewResult) => void;
};

/**
 * Enkel dialog för att granska och redigera OCR-text efter filuppladdning.
 * När användaren klickar "Spara" skickas OCR-texten till backend
 * som kör AI-analys i bakgrunden och skapar embeddings.
 *
 * Dialogen öppnas direkt vid uppladdning - OCR körs i bakgrunden
 * och fylls i automatiskt när det är klart.
 */
export function OcrReviewDialog({
  open,
  onOpenChange,
  file,
  onComplete,
}: OcrReviewDialogProps) {
  const t = useTranslations("personalAi.ocrReview");
  const [ocrText, setOcrText] = useState(file.ocrText ?? "");
  const [userDescription, setUserDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Update OCR text when it arrives from the upload
  useEffect(() => {
    if (file.ocrText && !file.ocrLoading) {
      setOcrText(file.ocrText);
    }
  }, [file.ocrText, file.ocrLoading]);

  const isImage = IMAGE_TYPES.test(file.type);
  const hasContent = ocrText.trim().length > 0 || userDescription.trim().length > 0;
  const isUploading = file.id.startsWith("temp-");
  const canSave = !isSaving && !isUploading;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setIsSaving(true);

    try {
      // Skicka till backend för bakgrundsanalys + embeddings
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

      // Stäng direkt - analys körs i bakgrunden
      onComplete({
        ocrText: ocrText.trim(),
        userDescription: userDescription.trim(),
        skipped: false,
      });
      onOpenChange(false);
    } catch (err) {
      console.error("Error finalizing file:", err);
      // Stäng ändå - vi vill inte blockera användaren
      onComplete({
        ocrText: ocrText.trim(),
        userDescription: userDescription.trim(),
        skipped: false,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }, [file.id, ocrText, userDescription, canSave, onComplete, onOpenChange]);

  const handleSkip = useCallback(() => {
    onComplete({
      ocrText: "",
      userDescription: "",
      skipped: true,
    });
    onOpenChange(false);
  }, [onComplete, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="size-5 text-muted-foreground" />
            {t("title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("title")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          {/* Fil-info */}
          <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
            {isImage ? (
              <img
                src={file.url}
                alt={file.name}
                className="size-16 shrink-0 rounded-md border border-border object-cover"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                <FileText className="size-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">{file.type}</p>
              {isUploading && (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {t("uploading")}
                </p>
              )}
            </div>
          </div>

          {/* OCR-editor med loading-state */}
          <OcrEditor
            value={ocrText}
            onChange={setOcrText}
            loading={file.ocrLoading}
          />

          {/* Egen beskrivning */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-description" className="text-sm font-medium">
              {t("descriptionLabel")}
            </Label>
            <Textarea
              id="user-description"
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              rows={3}
              className="resize-none text-sm"
              autoFocus
            />
          </div>

          {!hasContent && !file.ocrLoading && (
            <p className="text-xs text-muted-foreground">
              {t("noTextHint")}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            disabled={isSaving}
          >
            {t("skip")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!canSave}
            className="gap-1.5"
          >
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("saving")}
              </>
            ) : isUploading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("uploading")}
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                {t("save")}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
