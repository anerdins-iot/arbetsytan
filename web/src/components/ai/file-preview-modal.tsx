"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getFilePreviewData } from "@/actions/files";

const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp)/i;
const PDF_TYPE = "application/pdf";
const EXCEL_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];
const WORD_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

type FilePreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  fileName: string;
  projectId: string | null;
};

type ExcelData = {
  sheetName: string;
  headers: string[];
  rows: (string | number | null)[][];
};

type WordContent = {
  html: string;
};

export function FilePreviewModal({
  open,
  onOpenChange,
  fileId,
  fileName,
  projectId,
}: FilePreviewModalProps) {
  const t = useTranslations("personalAi.filePreview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [excelData, setExcelData] = useState<ExcelData[]>([]);
  const [wordContent, setWordContent] = useState<WordContent | null>(null);
  const [processingPreview, setProcessingPreview] = useState(false);

  useEffect(() => {
    if (!open || !fileId) return;
    setLoading(true);
    setError(null);
    setDownloadUrl(null);
    setFileType(null);
    setOcrText(null);
    setExcelData([]);
    setWordContent(null);
    setProcessingPreview(false);

    getFilePreviewData({
      fileId,
      projectId: projectId ?? undefined,
    })
      .then(async (res) => {
        if (!res.success) {
          setError(res.error);
          return;
        }
        setDownloadUrl(res.file.downloadUrl);
        setFileType(res.file.type);
        setOcrText(res.file.ocrText);

        // Process Excel or Word for preview
        const isExcel = EXCEL_TYPES.includes(res.file.type) || /\.xlsx?$/i.test(res.file.name);
        const isWord = WORD_TYPES.includes(res.file.type) || /\.docx?$/i.test(res.file.name);

        if (isExcel || isWord) {
          setProcessingPreview(true);
          try {
            const previewRes = await fetch("/api/files/preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileId,
                projectId: projectId ?? undefined,
              }),
            });

            if (previewRes.ok) {
              const data = await previewRes.json();
              if (data.type === "excel") {
                setExcelData(data.sheets || []);
              } else if (data.type === "word") {
                setWordContent({ html: data.html || "" });
              }
            }
          } catch (err) {
            console.error("Preview generation failed:", err);
          } finally {
            setProcessingPreview(false);
          }
        }
      })
      .catch(() => setError("FETCH_FILE_FAILED"))
      .finally(() => setLoading(false));
  }, [open, fileId, projectId]);

  const isImage = fileType ? IMAGE_TYPES.test(fileType) : false;
  const isPdf = fileType === PDF_TYPE;
  const isExcel = fileType ? EXCEL_TYPES.includes(fileType) : false;
  const isWord = fileType ? WORD_TYPES.includes(fileType) : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 max-w-[calc(100%-2rem)] sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8 text-base">
            {fileName}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <p className="text-sm text-destructive">{t("error")}</p>
        )}

        {!loading && !error && downloadUrl && (
          <>
            {/* Bild: visa direkt */}
            {isImage && (
              <div className="flex min-h-0 flex-1 justify-center overflow-auto rounded-md border border-border bg-muted/30 p-4">
                <img
                  src={downloadUrl}
                  alt={fileName}
                  className="max-h-[70vh] max-w-full object-contain"
                />
              </div>
            )}

            {/* PDF: iframe med större storlek */}
            {isPdf && (
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                {ocrText ? (
                  <div className="flex flex-col gap-3">
                    <div className="min-h-[60vh] overflow-hidden rounded-md border border-border">
                      <iframe
                        src={downloadUrl}
                        title={fileName}
                        className="h-[60vh] w-full border-0"
                      />
                    </div>
                    <details className="rounded-md border border-border bg-muted/30 p-3">
                      <summary className="cursor-pointer text-sm font-medium text-foreground">
                        {t("ocrText") || "OCR Text"}
                      </summary>
                      <div className="mt-2 max-h-[30vh] overflow-auto">
                        <pre className="whitespace-pre-wrap break-all text-xs text-foreground">
                          {ocrText}
                        </pre>
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="min-h-[70vh] overflow-hidden rounded-md border border-border">
                    <iframe
                      src={downloadUrl}
                      title={fileName}
                      className="h-[70vh] w-full border-0"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Excel: tabell-preview */}
            {isExcel && (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                {processingPreview && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    <span>{t("loadingPreview") || "Laddar förhandsgranskning..."}</span>
                  </div>
                )}
                {excelData.length > 0 ? (
                  <ScrollArea className="h-[65vh] rounded-md border border-border">
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
                              {t("showingFirstRows") || `Visar första 100 av ${sheet.rows.length} rader`}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : !processingPreview ? (
                  <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-4">
                    <FileText className="size-10 shrink-0 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {t("excelPreviewFailed") || "Förhandsgranskning kunde inte genereras"}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {/* Word: HTML-preview */}
            {isWord && (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                {processingPreview && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    <span>{t("loadingPreview") || "Laddar förhandsgranskning..."}</span>
                  </div>
                )}
                {wordContent ? (
                  <ScrollArea className="h-[65vh] rounded-md border border-border bg-background">
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none p-6"
                      dangerouslySetInnerHTML={{ __html: wordContent.html }}
                    />
                  </ScrollArea>
                ) : !processingPreview ? (
                  <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-4">
                    <FileText className="size-10 shrink-0 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {t("wordPreviewFailed") || "Förhandsgranskning kunde inte genereras"}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {/* Övriga filer: bara nedladdning */}
            {!isImage && !isPdf && !isExcel && !isWord && (
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-4">
                <FileText className="size-10 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t("noPreview")}
                </p>
              </div>
            )}
          </>
        )}

        {!loading && downloadUrl && (
          <div className="flex justify-end border-t border-border pt-3">
            <Button asChild variant="default" size="sm" className="gap-2">
              <a
                href={downloadUrl}
                download={fileName}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="size-4" />
                {t("download")}
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
