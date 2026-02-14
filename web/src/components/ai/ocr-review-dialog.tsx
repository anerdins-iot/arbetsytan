"use client";

import { useState, useCallback } from "react";
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

type OcrReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: {
    id: string;
    name: string;
    type: string;
    url: string;
    ocrText?: string | null;
  };
  onComplete: () => void;
};

/**
 * Enkel dialog för att granska och redigera OCR-text efter filuppladdning.
 * När användaren klickar "Spara" skickas OCR-texten till backend
 * som kör AI-analys i bakgrunden och skapar embeddings.
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

  const isImage = IMAGE_TYPES.test(file.type);
  const hasContent = ocrText.trim().length > 0 || userDescription.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (isSaving) return;
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
      onComplete();
      onOpenChange(false);
    } catch (err) {
      console.error("Error finalizing file:", err);
      // Stäng ändå - vi vill inte blockera användaren
      onComplete();
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }, [file.id, ocrText, userDescription, isSaving, onComplete, onOpenChange]);

  const handleSkip = useCallback(() => {
    onComplete();
    onOpenChange(false);
  }, [onComplete, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg">
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
            </div>
          </div>

          {/* OCR-editor */}
          <OcrEditor value={ocrText} onChange={setOcrText} />

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
            />
          </div>

          {!hasContent && (
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
            disabled={isSaving}
            className="gap-1.5"
          >
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("saving")}
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
