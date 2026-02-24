"use client";

import { useTranslations } from "next-intl";
import {
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  PenLine,
  ScanText,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type FileListGridItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
  downloadUrl?: string;
  versionNumber?: number;
  ocrText?: string | null;
  userDescription?: string | null;
  aiAnalysis?: string | null;
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

function fileIcon(type: string) {
  if (type.startsWith("image/")) {
    return <FileImage className="size-4 text-muted-foreground" />;
  }
  if (
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return <FileSpreadsheet className="size-4 text-muted-foreground" />;
  }
  return <FileText className="size-4 text-muted-foreground" />;
}

function isImageFile(file: FileListGridItem): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function isPdfFile(file: FileListGridItem): boolean {
  if (file.type === "application/pdf") return true;
  return /\.pdf$/i.test(file.name);
}

function isExcelFile(file: FileListGridItem): boolean {
  if (
    file.type ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return true;
  return /\.xlsx$/i.test(file.name);
}

function renderFileThumbnail(file: FileListGridItem) {
  if (isImageFile(file) && file.previewUrl) {
    return (
      <img
        src={file.previewUrl}
        alt={file.name}
        className="h-32 w-full rounded-md border border-border object-cover"
      />
    );
  }

  if (isPdfFile(file)) {
    return (
      <div className="flex h-32 w-full items-center justify-center rounded-md border border-border bg-muted/50">
        <FileText className="size-8 text-muted-foreground" />
      </div>
    );
  }

  if (isExcelFile(file)) {
    return (
      <div className="flex h-32 w-full items-center justify-center rounded-md border border-border bg-muted/50">
        <FileSpreadsheet className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-32 w-full items-center justify-center rounded-md border border-border bg-muted/50">
      <FileText className="size-8 text-muted-foreground" />
    </div>
  );
}

type FileListGridProps = {
  files: FileListGridItem[];
  translationNamespace: string;
  emptyMessageKey?: string;
  onPreview?: (file: FileListGridItem) => void;
  onDownload?: (file: FileListGridItem) => void;
  onDelete?: (file: FileListGridItem) => void;
  isDeletingId?: string | null;
  showActions?: boolean;
};

export function FileListGrid({
  files,
  translationNamespace,
  emptyMessageKey = "empty",
  onPreview,
  onDownload,
  onDelete,
  isDeletingId = null,
  showActions = true,
}: FileListGridProps) {
  const t = useTranslations(translationNamespace);

  if (files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t(emptyMessageKey)}
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {files.map((file) => (
        <div
          key={file.id}
          className="rounded-md border border-border bg-card p-3"
        >
          {onPreview ? (
            <button
              type="button"
              className="w-full text-left"
              onClick={() => onPreview(file)}
            >
              {renderFileThumbnail(file)}
            </button>
          ) : (
            <div className="w-full text-left">
              {renderFileThumbnail(file)}
            </div>
          )}
          <div className="mt-3 flex min-w-0 items-center gap-2">
            {fileIcon(file.type)}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {file.name}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                </p>
                {file.versionNumber != null && file.versionNumber > 1 && (
                  <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t("versionBadge", { number: file.versionNumber })}
                  </span>
                )}
                {file.ocrText && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <ScanText className="size-2.5" />
                    {t("ocrBadge")}
                  </span>
                )}
                {file.aiAnalysis && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-2.5" />
                    {t("aiAnalysisBadge")}
                  </span>
                )}
                {file.userDescription && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <PenLine className="size-2.5" />
                    {t("userDescriptionBadge")}
                  </span>
                )}
              </div>
            </div>
          </div>
          {showActions && (file.downloadUrl || onDownload || onDelete) && (
            <div className="mt-3 flex items-center justify-end gap-2">
              {(file.downloadUrl || onDownload) && (
                file.downloadUrl ? (
                  <a
                    href={file.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button variant="outline" size="icon" type="button">
                      <Download className="size-4" />
                      <span className="sr-only">{t("downloadFile")}</span>
                    </Button>
                  </a>
                ) : onDownload ? (
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    onClick={() => onDownload(file)}
                  >
                    <Download className="size-4" />
                    <span className="sr-only">{t("downloadFile")}</span>
                  </Button>
                ) : null
              )}
              {onDelete && (
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={() => void onDelete(file)}
                  disabled={isDeletingId === file.id}
                >
                  {isDeletingId === file.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  <span className="sr-only">{t("deleteFile")}</span>
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
