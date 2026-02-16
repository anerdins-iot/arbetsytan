"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  FileText,
  Loader2,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp)/i;
const TOTAL_STEPS = 4;

type FileAnalysisWizardProps = {
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

export function FileAnalysisWizard({
  open,
  onOpenChange,
  file,
  onAnalysisComplete,
}: FileAnalysisWizardProps) {
  const t = useTranslations("personalAi.fileAnalysis");
  const [step, setStep] = useState(1);
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
    setStep(3);
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
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
      setStep(2);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg"
        showCloseButton={step !== 3}
      >
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-5 text-muted-foreground" />
            {t("title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("title")}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <div className="flex flex-1 gap-1">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i + 1 <= step ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {t("step", { current: step, total: TOTAL_STEPS })}
          </span>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
          {/* Step 1: File preview + OCR text */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
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
              <OcrEditor value={ocrText} onChange={setOcrText} />
            </div>
          )}

          {/* Step 2: User description */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="wizard-description"
                  className="text-sm font-medium"
                >
                  {t("userDescription")}
                </Label>
                <Textarea
                  id="wizard-description"
                  value={userDescription}
                  onChange={(e) => setUserDescription(e.target.value)}
                  placeholder={t("userDescriptionPlaceholder")}
                  rows={6}
                  className="resize-none text-sm"
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          )}

          {/* Step 3: Analyzing */}
          {step === 3 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="size-10 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">
                {t("analyzing")}
              </p>
            </div>
          )}

          {/* Step 4: Result */}
          {step === 4 && result && (
            <div className="flex flex-col gap-4">
              {warning && (
                <p className="text-sm text-amber-600 dark:text-amber-500">{warning}</p>
              )}
              <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {t("result")}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
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
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          {/* Back button */}
          {step === 2 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(1)}
              className="gap-1.5"
            >
              <ArrowLeft className="size-4" />
              {t("back")}
            </Button>
          ) : (
            <div />
          )}

          {/* Next / Analyze / Done button */}
          {step === 1 && (
            <Button
              size="sm"
              onClick={() => setStep(2)}
              className="gap-1.5"
            >
              {t("next")}
              <ArrowRight className="size-4" />
            </Button>
          )}
          {step === 2 && (
            <Button
              size="sm"
              onClick={handleAnalyze}
              disabled={!canAnalyze || isAnalyzing}
              className="gap-1.5"
            >
              <Sparkles className="size-4" />
              {t("analyze")}
            </Button>
          )}
          {step === 4 && (
            <Button size="sm" onClick={handleDone} className="gap-1.5">
              <CheckCircle2 className="size-4" />
              {t("done")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
