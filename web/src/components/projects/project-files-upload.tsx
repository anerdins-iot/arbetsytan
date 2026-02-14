"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  ScanText,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  completeFileUpload,
  deleteFile,
  getFiles,
  prepareFileUpload,
  type FileItem,
} from "@/actions/files";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type UploadStatus = "queued" | "uploading" | "saving" | "done" | "error";

type UploadEntry = {
  id: string;
  name: string;
  progress: number;
  status: UploadStatus;
  error?: string;
};

const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

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

function isImageFile(file: FileItem): boolean {
  if (file.type.startsWith("image/")) {
    return true;
  }
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function isPdfFile(file: FileItem): boolean {
  if (file.type === "application/pdf") {
    return true;
  }
  return /\.pdf$/i.test(file.name);
}

export function ProjectFilesUpload({
  projectId,
  initialFiles,
}: {
  projectId: string;
  initialFiles: FileItem[];
}) {
  const t = useTranslations("projects.files");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const progressTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map()
  );
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [files, setFiles] = useState<FileItem[]>(initialFiles);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [showOcrText, setShowOcrText] = useState(false);
  const [isDeletingFileId, setIsDeletingFileId] = useState<string | null>(null);

  function mapErrorCode(errorCode: string): string {
    switch (errorCode) {
      case "VALIDATION_ERROR":
        return t("errorValidation");
      case "FILE_TOO_LARGE":
        return t("errorFileTooLarge");
      case "FILE_TYPE_NOT_ALLOWED":
        return t("errorFileType");
      case "TENANT_STORAGE_LIMIT_EXCEEDED":
        return t("errorTenantLimit");
      case "UPLOAD_TO_STORAGE_FAILED":
        return t("errorStorage");
      case "FILE_NOT_FOUND":
        return t("errorFileNotFound");
      case "DELETE_NOT_ALLOWED":
        return t("errorDeleteNotAllowed");
      case "DELETE_FILE_FAILED":
      case "FETCH_FILES_FAILED":
        return t("errorGeneric");
      default:
        return t("errorGeneric");
    }
  }

  function stopProgressTimer(uploadId: string) {
    const timer = progressTimers.current.get(uploadId);
    if (timer) {
      clearInterval(timer);
      progressTimers.current.delete(uploadId);
    }
  }

  function startProgressTimer(uploadId: string) {
    stopProgressTimer(uploadId);
    const timer = setInterval(() => {
      setUploads((current) =>
        current.map((entry) => {
          if (entry.id !== uploadId) return entry;
          if (entry.progress >= 90) return entry;
          return { ...entry, progress: Math.min(90, entry.progress + 8) };
        })
      );
    }, 250);
    progressTimers.current.set(uploadId, timer);
  }

  function updateUpload(
    uploadId: string,
    patch: Partial<UploadEntry>
  ): void {
    setUploads((current) =>
      current.map((entry) =>
        entry.id === uploadId ? { ...entry, ...patch } : entry
      )
    );
  }

  async function uploadSingleFile(file: File): Promise<void> {
    const uploadId = crypto.randomUUID();
    const entry: UploadEntry = {
      id: uploadId,
      name: file.name,
      progress: 0,
      status: "queued",
    };
    setUploads((current) => [entry, ...current]);

    try {
      updateUpload(uploadId, { status: "uploading" });
      startProgressTimer(uploadId);

      const prepared = await prepareFileUpload({
        projectId,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
      });

      if (!prepared.success) {
        throw new Error(prepared.error);
      }

      const body = new Uint8Array(await file.arrayBuffer());
      const putResponse = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body,
      });

      if (!putResponse.ok) {
        throw new Error("UPLOAD_TO_STORAGE_FAILED");
      }

      updateUpload(uploadId, { status: "saving", progress: 92 });

      const completed = await completeFileUpload({
        projectId,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        bucket: prepared.bucket,
        key: prepared.key,
      });

      if (!completed.success) {
        throw new Error(completed.error);
      }

      updateUpload(uploadId, { status: "done", progress: 100 });
      setFiles((current) => [completed.file, ...current]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "UPLOAD_FAILED";
      updateUpload(uploadId, {
        status: "error",
        progress: 100,
        error: mapErrorCode(message),
      });
    } finally {
      stopProgressTimer(uploadId);
    }
  }

  async function handleFilesSelection(fileList: FileList | null): Promise<void> {
    if (!fileList || fileList.length === 0) return;
    setGeneralError(null);

    const selected = Array.from(fileList);
    await Promise.all(selected.map((file) => uploadSingleFile(file)));

    const refreshed = await getFiles(projectId);
    if (refreshed.success) {
      setFiles(refreshed.files);
    } else {
      setGeneralError(mapErrorCode(refreshed.error));
    }
  }

  async function refreshFiles(): Promise<void> {
    const refreshed = await getFiles(projectId);
    if (refreshed.success) {
      setFiles(refreshed.files);
      return;
    }
    setGeneralError(mapErrorCode(refreshed.error));
  }

  function handlePreview(file: FileItem): void {
    if (isImageFile(file) || isPdfFile(file)) {
      setPreviewFile(file);
      setShowOcrText(false);
      return;
    }
    window.open(file.downloadUrl, "_blank", "noopener,noreferrer");
  }

  async function handleDelete(file: FileItem): Promise<void> {
    const shouldDelete = window.confirm(t("deleteConfirm", { name: file.name }));
    if (!shouldDelete) {
      return;
    }

    setGeneralError(null);
    setIsDeletingFileId(file.id);

    const result = await deleteFile({
      projectId,
      fileId: file.id,
    });

    if (!result.success) {
      setGeneralError(mapErrorCode(result.error));
      setIsDeletingFileId(null);
      return;
    }

    if (previewFile?.id === file.id) {
      setPreviewFile(null);
    }

    await refreshFiles();
    setIsDeletingFileId(null);
  }

  function renderFileThumbnail(file: FileItem) {
    if (isImageFile(file)) {
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

    if (
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      /\.xlsx$/i.test(file.name)
    ) {
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            onChange={(event) => {
              void handleFilesSelection(event.target.files);
              event.currentTarget.value = "";
            }}
          />

          <div
            className={[
              "rounded-lg border border-dashed p-8 text-center transition-colors",
              isDragActive ? "border-primary bg-muted/60" : "border-border",
            ].join(" ")}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragActive(false);
              void handleFilesSelection(event.dataTransfer.files);
            }}
          >
            <UploadCloud className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-foreground">{t("dropzone")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("allowedTypes")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("maxSize")}</p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => inputRef.current?.click()}
            >
              {t("chooseFiles")}
            </Button>
          </div>

          {generalError ? (
            <p className="text-sm text-destructive">{generalError}</p>
          ) : null}

          {uploads.length > 0 ? (
            <div className="space-y-3">
              {uploads.map((entry) => (
                <div key={entry.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-foreground">
                      {entry.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {entry.status === "saving" ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : null}
                      <span>
                        {entry.status === "queued" && t("statusQueued")}
                        {entry.status === "uploading" && t("statusUploading")}
                        {entry.status === "saving" && t("statusSaving")}
                        {entry.status === "done" && t("statusDone")}
                        {entry.status === "error" && t("statusError")}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-muted">
                    <div
                      className={[
                        "h-2 rounded-full transition-all",
                        entry.status === "error" ? "bg-destructive" : "bg-primary",
                      ].join(" ")}
                      style={{ width: `${entry.progress}%` }}
                    />
                  </div>
                  {entry.error ? (
                    <p className="mt-2 text-xs text-destructive">{entry.error}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("uploadedFilesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="rounded-md border border-border bg-card p-3"
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => handlePreview(file)}
                  >
                    {renderFileThumbnail(file)}
                  </button>
                  <div className="mt-3 flex min-w-0 items-center gap-2">
                    {fileIcon(file.type)}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {file.name}
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(file.size)}
                        </p>
                        {file.ocrText ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            <ScanText className="size-2.5" />
                            {t("ocrBadge")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <a href={file.downloadUrl} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="icon" type="button">
                        <Download className="size-4" />
                        <span className="sr-only">{t("downloadFile")}</span>
                      </Button>
                    </a>
                    <Button
                      variant="outline"
                      size="icon"
                      type="button"
                      onClick={() => void handleDelete(file)}
                      disabled={isDeletingFileId === file.id}
                    >
                      {isDeletingFileId === file.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                      <span className="sr-only">{t("deleteFile")}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={previewFile !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewFile(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl p-0" showCloseButton={false}>
          {previewFile ? (
            <div className="flex max-h-[85vh] flex-col">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {previewFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(previewFile.size)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={previewFile.downloadUrl}
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
                    onClick={() => setPreviewFile(null)}
                  >
                    <X className="size-4" />
                    <span className="sr-only">{t("closePreview")}</span>
                  </Button>
                </div>
              </div>

              <div className="overflow-auto bg-muted/30 p-4">
                {isImageFile(previewFile) ? (
                  <img
                    src={previewFile.previewUrl}
                    alt={previewFile.name}
                    className="mx-auto max-h-[70vh] w-auto rounded-md border border-border object-contain"
                  />
                ) : (
                  <iframe
                    title={previewFile.name}
                    src={previewFile.previewUrl}
                    className="h-[70vh] w-full rounded-md border border-border bg-background"
                  />
                )}
              </div>

              {previewFile.ocrText ? (
                <div className="border-t border-border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between p-4 text-left text-sm font-medium text-foreground hover:bg-muted/50"
                    onClick={() => setShowOcrText(!showOcrText)}
                  >
                    <span className="flex items-center gap-2">
                      <ScanText className="size-4" />
                      {t("ocrTitle")}
                    </span>
                    {showOcrText ? (
                      <ChevronUp className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                  </button>
                  {showOcrText ? (
                    <div className="max-h-[40vh] overflow-auto border-t border-border bg-muted/20 p-4">
                      <pre className="whitespace-pre-wrap break-all text-sm text-foreground">
                        {previewFile.ocrText}
                      </pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
