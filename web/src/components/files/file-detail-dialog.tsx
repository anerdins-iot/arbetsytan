"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Download,
  FileText,
  Loader2,
  X,
  FileSpreadsheet,
  Image as ImageIcon,
  FileIcon,
  Eye,
  ScanText,
  Bot,
  Info,
  Pencil,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { WordEditor } from "@/components/files/word-editor";
import { ExcelEditor } from "@/components/files/excel-editor";
import { TemplateFiller } from "@/components/files/template-filler";

const EXCEL_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

const WORD_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

const PPTX_TYPES = [
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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
  projectId?: string;
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

function isWordFile(file: FileDetailItem): boolean {
  return WORD_TYPES.includes(file.type) || /\.docx?$/i.test(file.name);
}

function isTemplateCapableFile(file: FileDetailItem): boolean {
  return (
    WORD_TYPES.includes(file.type) ||
    PPTX_TYPES.includes(file.type) ||
    /\.docx$/i.test(file.name) ||
    /\.pptx$/i.test(file.name)
  );
}

function getFileIcon(file: FileDetailItem) {
  if (isImageFile(file)) return ImageIcon;
  if (isExcelFile(file)) return FileSpreadsheet;
  return FileIcon;
}

function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : "";
}

type TemplateAnalysisData = {
  fileId: string;
  fileName: string;
  variables: string[];
  loops: Array<{ name: string; variables: string[] }>;
};

export function FileDetailDialog({
  open,
  onOpenChange,
  file,
  translationNamespace,
  projectId,
  onSaved,
}: FileDetailDialogProps) {
  const t = useTranslations(translationNamespace);
  const [ocrText, setOcrText] = useState("");
  const [userDescription, setUserDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [excelData, setExcelData] = useState<ExcelData[]>([]);
  const [wordHtml, setWordHtml] = useState("");
  const [wordText, setWordText] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [activeSheet, setActiveSheet] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [templateAnalysis, setTemplateAnalysis] = useState<TemplateAnalysisData | null>(null);
  const [isAnalyzingTemplate, setIsAnalyzingTemplate] = useState(false);
  const [showTemplateFiller, setShowTemplateFiller] = useState(false);

  useEffect(() => {
    if (file) {
      setOcrText(file.ocrText ?? "");
      setUserDescription(file.userDescription ?? "");
      setExcelData([]);
      setWordHtml("");
      setWordText("");
      setActiveSheet(0);
      setIsEditing(false);
      setTemplateAnalysis(null);
      setShowTemplateFiller(false);
      setIsAnalyzingTemplate(false);

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

      if (isWordFile(file)) {
        setLoadingPreview(true);
        fetch("/api/files/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: file.id }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.type === "word" && data.html) {
              setWordHtml(data.html);
              const div = document.createElement("div");
              div.innerHTML = data.html;
              setWordText(div.textContent || div.innerText || "");
            }
          })
          .catch((err) => {
            console.error("Word preview failed:", err);
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

  const handleAnalyzeTemplate = useCallback(async () => {
    if (!file || isAnalyzingTemplate) return;
    setIsAnalyzingTemplate(true);
    try {
      const res = await fetch("/api/files/analyze-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, projectId }),
      });
      if (!res.ok) {
        console.error("Template analysis failed:", res.statusText);
        return;
      }
      const data = await res.json() as TemplateAnalysisData;
      setTemplateAnalysis(data);
      setShowTemplateFiller(true);
    } catch (err) {
      console.error("Template analysis error:", err);
    } finally {
      setIsAnalyzingTemplate(false);
    }
  }, [file, projectId, isAnalyzingTemplate]);

  if (!file) return null;

  const isImage = isImageFile(file);
  const isPdf = isPdfFile(file);
  const isExcel = isExcelFile(file);
  const isWord = isWordFile(file);
  const isTemplate = isTemplateCapableFile(file);
  const hasOcr = !!(file.ocrText && file.ocrText.trim());
  const hasAiAnalysis = !!(file.label || file.aiAnalysis);
  const Icon = getFileIcon(file);
  const ext = getFileExtension(file.name);

  // Template filler view
  if (showTemplateFiller && templateAnalysis && projectId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[calc(100%-2rem)] p-0 sm:max-w-3xl" showCloseButton={false}>
          <div className="flex max-h-[90vh] flex-col">
            <TemplateFiller
              analysis={templateAnalysis}
              projectId={projectId}
              translationNamespace={translationNamespace}
              onGenerated={() => {
                setShowTemplateFiller(false);
                setTemplateAnalysis(null);
                onSaved?.();
                onOpenChange(false);
              }}
              onCancel={() => {
                setShowTemplateFiller(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Word editor view
  if (isEditing && isWord) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[calc(100%-2rem)] p-0 sm:max-w-5xl" showCloseButton={false}>
          <div className="max-h-[90vh] overflow-hidden">
            <WordEditor
              fileId={file.id}
              fileName={file.name}
              projectId={projectId}
              initialContent={wordText}
              translationNamespace={translationNamespace}
              onSaved={() => {
                onSaved?.();
              }}
              onClose={() => setIsEditing(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Excel editor view
  if (isEditing && isExcel && excelData.length > 0) {
    return (
      <ExcelEditor
        open={open}
        onOpenChange={(v) => {
          if (!v) setIsEditing(false);
          onOpenChange(v);
        }}
        fileId={file.id}
        fileName={file.name}
        projectId={projectId}
        sheets={excelData}
        onSaved={() => {
          onSaved?.();
          setIsEditing(false);
        }}
      />
    );
  }

  // Determine default tab
  const defaultTab = (isImage || isPdf || isExcel || isWord) ? "preview" : hasOcr ? "ocr" : hasAiAnalysis ? "ai" : "info";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] p-0 sm:max-w-7xl" showCloseButton={false}>
        <div className="flex max-h-[90vh] flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatBytes(file.size)}</span>
                  {ext && (
                    <>
                      <span>·</span>
                      <span>{ext}</span>
                    </>
                  )}
                  {hasOcr && <Badge variant="secondary" className="h-4 px-1 text-[10px]">OCR</Badge>}
                  {hasAiAnalysis && <Badge variant="secondary" className="h-4 px-1 text-[10px]">AI</Badge>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isExcel && excelData.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setIsEditing(true)}
                  disabled={loadingPreview}
                >
                  <Pencil className="mr-2 size-4" />
                  {t("editExcel")}
                </Button>
              )}
              {isWord && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setIsEditing(true)}
                  disabled={loadingPreview || !wordText}
                >
                  <Pencil className="mr-2 size-4" />
                  {t("editDocument")}
                </Button>
              )}
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

          {/* Tabbed content */}
          <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border px-5">
              <TabsList variant="line" className="h-10">
                <TabsTrigger value="preview" className="gap-1.5">
                  <Eye className="size-3.5" />
                  {t("tabPreview")}
                </TabsTrigger>
                <TabsTrigger value="ocr" className="gap-1.5">
                  <ScanText className="size-3.5" />
                  {t("tabOcrText")}
                </TabsTrigger>
                <TabsTrigger value="ai" className="gap-1.5">
                  <Bot className="size-3.5" />
                  {t("tabAiAnalysis")}
                </TabsTrigger>
                <TabsTrigger value="info" className="gap-1.5">
                  <Info className="size-3.5" />
                  {t("tabInfo")}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Preview Tab */}
            <TabsContent value="preview" className="min-h-0 overflow-hidden">
              <ScrollArea className="h-[calc(90vh-8rem)]">
                <div className="p-5">
                  {isImage ? (
                    <img
                      src={file.previewUrl}
                      alt={file.name}
                      className="mx-auto max-h-[65vh] w-auto rounded-md border border-border object-contain"
                    />
                  ) : isPdf ? (
                    <iframe
                      title={file.name}
                      src={file.previewUrl}
                      className="h-[65vh] w-full rounded-md border border-border bg-background"
                    />
                  ) : isExcel ? (
                    <div className="overflow-hidden rounded-md border border-border bg-background">
                      {loadingPreview ? (
                        <div className="flex h-64 items-center justify-center">
                          <Loader2 className="size-8 animate-spin text-muted-foreground" />
                        </div>
                      ) : excelData.length > 0 ? (
                        <div>
                          {/* Sheet tabs */}
                          {excelData.length > 1 && (
                            <div className="flex gap-0 border-b border-border bg-muted/30">
                              {excelData.map((sheet, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setActiveSheet(idx)}
                                  className={`px-4 py-2 text-xs font-medium transition-colors ${
                                    activeSheet === idx
                                      ? "border-b-2 border-primary bg-background text-foreground"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {sheet.sheetName}
                                </button>
                              ))}
                            </div>
                          )}
                          {/* Active sheet table */}
                          {excelData[activeSheet] && (
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    {excelData[activeSheet].headers.map((header, idx) => (
                                      <TableHead key={idx} className="whitespace-nowrap text-xs">
                                        {header || `Column ${idx + 1}`}
                                      </TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {excelData[activeSheet].rows.slice(0, 100).map((row, rowIdx) => (
                                    <TableRow key={rowIdx}>
                                      {row.map((cell, cellIdx) => (
                                        <TableCell key={cellIdx} className="whitespace-nowrap text-xs">
                                          {cell !== null && cell !== undefined ? String(cell) : ""}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              {excelData[activeSheet].rows.length > 100 && (
                                <p className="border-t border-border p-3 text-xs text-muted-foreground">
                                  {t("showingRows", { count: 100, total: excelData[activeSheet].rows.length })}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex h-64 items-center justify-center">
                          <div className="text-center">
                            <FileSpreadsheet className="mx-auto mb-2 size-10 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">{t("noPreview")}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : isWord ? (
                    <div className="overflow-hidden rounded-md border border-border bg-background">
                      {loadingPreview ? (
                        <div className="flex h-64 items-center justify-center">
                          <Loader2 className="size-8 animate-spin text-muted-foreground" />
                        </div>
                      ) : wordHtml ? (
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none p-6"
                          dangerouslySetInnerHTML={{ __html: wordHtml }}
                        />
                      ) : (
                        <div className="flex h-64 items-center justify-center">
                          <div className="text-center">
                            <FileText className="mx-auto mb-2 size-10 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">{t("noPreview")}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-64 items-center justify-center rounded-md border border-border bg-muted/30">
                      <div className="text-center">
                        <FileText className="mx-auto mb-2 size-10 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">{t("noPreview")}</p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* OCR Text Tab */}
            <TabsContent value="ocr" className="min-h-0 overflow-hidden">
              <ScrollArea className="h-[calc(90vh-8rem)]">
                <div className="space-y-4 p-5">
                  {/* Editable OCR text - shows existing text or empty for editing */}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ocr-text" className="text-sm font-medium">
                      {t("ocrTitle")}
                    </Label>
                    {hasOcr || ocrText ? (
                      <Textarea
                        id="ocr-text"
                        value={ocrText}
                        onChange={(e) => setOcrText(e.target.value)}
                        placeholder={t("ocrTitle")}
                        rows={12}
                        className="resize-y font-mono text-sm"
                      />
                    ) : (
                      <div className="flex h-48 items-center justify-center rounded-md border border-border bg-muted/20">
                        <div className="text-center">
                          <ScanText className="mx-auto mb-2 size-10 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">{t("noOcrText")}</p>
                        </div>
                      </div>
                    )}
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
                      className="resize-y text-sm"
                    />
                  </div>

                  {/* Save button */}
                  <Button
                    size="sm"
                    onClick={() => void handleSave()}
                    disabled={isSaving}
                    className="gap-1.5"
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
              </ScrollArea>
            </TabsContent>

            {/* AI Analysis Tab */}
            <TabsContent value="ai" className="min-h-0 overflow-hidden">
              <ScrollArea className="h-[calc(90vh-8rem)]">
                <div className="p-5">
                  {hasAiAnalysis ? (
                    <div className="space-y-4">
                      {file.label && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-muted-foreground">{t("aiAnalysisLabel")}:</span>
                          <Badge variant="outline" className="text-sm">
                            {file.label}
                          </Badge>
                        </div>
                      )}
                      {file.aiAnalysis && (
                        <div className="rounded-md border border-border bg-muted/20 p-4">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                            {file.aiAnalysis}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-48 items-center justify-center rounded-md border border-border bg-muted/20">
                      <div className="text-center">
                        <Bot className="mx-auto mb-2 size-10 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">{t("noAiAnalysis")}</p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Info Tab */}
            <TabsContent value="info" className="min-h-0 overflow-hidden">
              <ScrollArea className="h-[calc(90vh-8rem)]">
                <div className="p-5">
                  <div className="space-y-3 rounded-md border border-border p-4">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <span className="text-sm text-muted-foreground">{t("fileType")}</span>
                      <span className="text-sm font-medium text-foreground">{ext || file.type}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <span className="text-sm text-muted-foreground">{t("fileSize")}</span>
                      <span className="text-sm font-medium text-foreground">{formatBytes(file.size)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">MIME</span>
                      <span className="text-sm font-medium text-foreground">{file.type}</span>
                    </div>
                  </div>

                  {/* User description */}
                  <div className="mt-6 flex flex-col gap-2">
                    <Label htmlFor="user-description-info" className="text-sm font-medium">
                      {t("descriptionLabel")}
                    </Label>
                    <Textarea
                      id="user-description-info"
                      value={userDescription}
                      onChange={(e) => setUserDescription(e.target.value)}
                      placeholder={t("descriptionPlaceholder")}
                      rows={3}
                      className="resize-y text-sm"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={() => void handleSave()}
                    disabled={isSaving}
                    className="mt-4 gap-1.5"
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
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
