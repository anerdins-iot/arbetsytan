"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  FileText,
  Loader2,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { OcrEditor } from "@/components/ai/ocr-editor";

const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp)/i;

type FileAnalysisSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: {
    id: string;
    name: string;
    type: string;
    url: string;
    ocrText?: string | null;
  };
  onAnalysisComplete: (result: { label: string; description: string }) => void;
};

type AnalysisResponse = {
  label: string;
  description: string;
  warning?: string;
  error?: string;
};

async function analyzeFile(data: {
  fileId: string;
  ocrText: string;
  userDescription: string;
}): Promise<AnalysisResponse> {
  const res = await fetch("/api/ai/analyze-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || "Analys misslyckades");
  }
  return json;
}

export function FileAnalysisSheet({
  open,
  onOpenChange,
  file,
  onAnalysisComplete,
}: FileAnalysisSheetProps) {
  const t = useTranslations("personalAi.fileAnalysis");
  const [ocrText, setOcrText] = useState(file.ocrText ?? "");
  const [userDescription, setUserDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<{
    label: string;
    description: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const isImage = IMAGE_TYPES.test(file.type);
  // Need OCR text or user description to provide context for analysis
  const canAnalyze = !!(ocrText.trim() || userDescription.trim());

  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze || isAnalyzing) return;
    setIsAnalyzing(true);
    setError(null);
    setWarning(null);

    try {
      const analysisResult = await analyzeFile({
        fileId: file.id,
        ocrText: ocrText.trim(),
        userDescription: userDescription.trim(),
      });
      setResult({ label: analysisResult.label, description: analysisResult.description });
      if (analysisResult.warning) {
        setWarning(analysisResult.warning);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setIsAnalyzing(false);
    }
  }, [canAnalyze, isAnalyzing, file.id, ocrText, userDescription, t]);

  const handleDone = useCallback(() => {
    if (result) {
      onAnalysisComplete(result);
    }
    onOpenChange(false);
  }, [result, onAnalysisComplete, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-hidden p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-left text-base">
            <Sparkles className="size-5 text-muted-foreground" />
            {t("title")}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("title")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          {/* File preview */}
          <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
            {isImage ? (
              <img
                src={file.url}
                alt={file.name}
                className="size-20 shrink-0 rounded-md border border-border object-cover"
              />
            ) : (
              <div className="flex size-20 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                <FileText className="size-8 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">{file.type}</p>
            </div>
          </div>

          {/* OCR text editor */}
          <OcrEditor value={ocrText} onChange={setOcrText} />

          {/* User description */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-description" className="text-sm font-medium">
              {t("userDescription")}
            </Label>
            <Textarea
              id="user-description"
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
              placeholder={t("userDescriptionPlaceholder")}
              rows={4}
              className="resize-none text-sm"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Warning */}
          {warning && !error && (
            <p className="text-sm text-amber-600 dark:text-amber-500">{warning}</p>
          )}

          {/* Result view */}
          {result && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {t("result")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("label")}
                  </span>
                  <p className="text-sm text-foreground">{result.label}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("description")}
                  </span>
                  <p className="text-sm text-foreground">
                    {result.description}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with action buttons */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          {result ? (
            <Button onClick={handleDone} size="sm" className="gap-2">
              <CheckCircle2 className="size-4" />
              {t("done")}
            </Button>
          ) : (
            <Button
              onClick={handleAnalyze}
              disabled={!canAnalyze || isAnalyzing}
              size="sm"
              className="gap-2"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("analyzing")}
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  {t("analyze")}
                </>
              )}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
