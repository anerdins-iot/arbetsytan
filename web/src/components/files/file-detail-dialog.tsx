"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Download, FileText, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp)/i;
const EXCEL_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

type FileDetailItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  ocrText: string | null;
  userDescription?: string | null;
  aiAnalysis?: string | null;
  label?: string | null;
  previewUrl: string;
  downloadUrl: string;
};

type ExcelData = {
  sheetName: string;
  headers: string[];
  rows: (string | number | null)[][];
};

type FileDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FileDetailItem | null;
  translationNamespace: "projects.files" | "personal.files";
  onSaved?: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function isImageFile(file: FileDetailItem): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function isPdfFile(file: FileDetailItem): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isExcelFile(file: FileDetailItem): boolean {
  return EXCEL_TYPES.includes(file.type) || /\.xlsx?$/i.test(file.name);
}

export function FileDetailDialog({
  open,
  onOpenChange,
  file,
  translationNamespace,
  onSaved,
}: FileDetailDialogProps) {
  const t = useTranslations(translationNamespace);
  const [ocrText, setOcrText] = useState("");
  const [userDescription, setUserDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [excelData, setExcelData] = useState<ExcelData[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (file) {
      setOcrText(file.ocrText ?? "");
      setUserDescription(file.userDescription ?? "");
      setExcelData([]);

      // Load Excel preview if it's an Excel file
      if (isExcelFile(file)) {
        setLoadingPreview(true);
        fetch("/api/files/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: file.id }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.type === "excel" && data.sheets) {
              setExcelData(data.sheets);
            }
          })
          .catch((err) => {
            console.error("Excel preview failed:", err);
          })
          .finally(() => {
            setLoadingPreview(false);
          });
      }
    }
  }, [file]);

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

  const isImage = isImageFile(file);
  const isPdf = isPdfFile(file);
  const isExcel = isExcelFile(file);
  const hasAiAnalysis = !!(file.label || file.aiAnalysis);

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

          {/* Preview + form */}
          <div className="flex flex-1 overflow-auto">
            {/* Left: preview */}
            <div className="w-1/2 shrink-0 overflow-auto bg-muted/30 p-4">
              {isImage ? (
                <img
                  src={file.previewUrl}
                  alt={file.name}
                  className="mx-auto max-h-[60vh] w-auto rounded-md border border-border object-contain"
                />
              ) : isPdf ? (
                <iframe
                  title={file.name}
                  src={file.previewUrl}
                  className="h-[60vh] w-full rounded-md border border-border bg-background"
                />
              ) : isExcel ? (
                <div className="h-[60vh] overflow-hidden rounded-md border border-border bg-background">
                  {loadingPreview ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : excelData.length > 0 ? (
                    <ScrollArea className="h-full">
                      <div className="p-4">
                        {excelData.map((sheet, sheetIdx) => (
                          <div key={sheetIdx} className="mb-6 last:mb-0">
                            <h3 className="mb-3 text-sm font-semibold text-foreground">
                              {sheet.sheetName}
                            </h3>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    {sheet.headers.map((header, idx) => (
                                      <TableHead key={idx} className="whitespace-nowrap">
                                        {header || `Column ${idx + 1}`}
                                      </TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {sheet.rows.slice(0, 100).map((row, rowIdx) => (
                                    <TableRow key={rowIdx}>
                                      {row.map((cell, cellIdx) => (
                                        <TableCell key={cellIdx} className="text-sm">
                                          {cell !== null && cell !== undefined ? String(cell) : ""}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                            {sheet.rows.length > 100 && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Visar första 100 av {sheet.rows.length} rader
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <FileText className="size-12 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-md border border-border bg-muted">
                  <FileText className="size-12 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Right: OCR, description, AI analysis */}
            <div className="flex w-1/2 flex-col gap-4 overflow-y-auto border-l border-border p-4">
              {/* OCR */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="ocr-text" className="text-sm font-medium">
                  {t("ocrTitle")}
                </Label>
                <Textarea
                  id="ocr-text"
                  value={ocrText}
                  onChange={(e) => setOcrText(e.target.value)}
                  placeholder={t("ocrTitle")}
                  rows={5}
                  className="resize-none text-sm"
                />
              </div>

              {/* User description */}
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

              {/* AI analysis (read-only) */}
              {hasAiAnalysis && (
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="mb-2 text-sm font-medium text-foreground">
                    {t("aiAnalysisTitle")}
                  </p>
                  {file.label && (
                    <p className="mb-1 text-xs text-muted-foreground">
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

              {/* Save */}
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="mt-auto gap-1.5"
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
