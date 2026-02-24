"use client";

import { X, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UploadedFile } from "@/components/ai/personal-ai-chat-types";

type TranslationFn = (key: string) => string;

export type ChatUploadedFilesStripProps = {
  files: UploadedFile[];
  onRemove: (fileId: string) => void;
  t: TranslationFn;
  getFileIcon?: (fileType: string) => React.ReactNode;
};

function defaultFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) {
    return <ImageIcon className="size-4 shrink-0" />;
  }
  return <FileText className="size-4 shrink-0" />;
}

export function ChatUploadedFilesStrip({
  files,
  onRemove,
  t,
  getFileIcon = defaultFileIcon,
}: ChatUploadedFilesStripProps) {
  if (files.length === 0) return null;

  return (
    <div className="border-t border-border px-3 py-2">
      <div className="flex flex-wrap gap-2">
        {files.map((file) => {
          const isImage = file.type.startsWith("image/");
          if (isImage && file.thumbnailUrl) {
            return (
              <div
                key={file.id}
                className="group relative size-14 shrink-0 overflow-hidden rounded-md border border-border"
              >
                <img
                  src={file.thumbnailUrl}
                  alt={file.name}
                  className="size-full object-cover"
                />
                {(file.status === "uploading" || file.status === "analyzing") && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {file.status === "error" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-destructive/20">
                    <X className="size-4 text-destructive" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(file.id)}
                  className="absolute -right-1 -top-1 hidden rounded-full bg-background p-0.5 shadow-sm group-hover:block"
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          }
          return (
            <div
              key={file.id}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs",
                file.status === "error"
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : file.status === "done"
                    ? "border-border bg-muted text-foreground"
                    : "border-border bg-muted/50 text-muted-foreground"
              )}
            >
              {file.status === "uploading" || file.status === "analyzing" ? (
                <Loader2 className="size-3.5 animate-spin shrink-0" />
              ) : (
                getFileIcon(file.type)
              )}
              <span className="max-w-[120px] truncate">{file.name}</span>
              {file.status === "uploading" && (
                <span className="text-muted-foreground">{t("uploading")}</span>
              )}
              {file.status === "analyzing" && (
                <span className="text-muted-foreground">{t("analyzing")}</span>
              )}
              {file.error && (
                <span className="text-destructive">{file.error}</span>
              )}
              <button
                type="button"
                onClick={() => onRemove(file.id)}
                className="ml-auto rounded p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
