"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  UploadCloud,
} from "lucide-react";
import {
  completeFileUpload,
  getProjectFiles,
  prepareFileUpload,
  type FileItem,
} from "@/actions/files";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

    const refreshed = await getProjectFiles(projectId);
    if (refreshed.success) {
      setFiles(refreshed.files);
    } else {
      setGeneralError(mapErrorCode(refreshed.error));
    }
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
            <div className="space-y-2">
              {files.map((file) => (
                <a
                  key={file.id}
                  href={file.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {fileIcon(file.type)}
                    <span className="truncate text-foreground">{file.name}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
