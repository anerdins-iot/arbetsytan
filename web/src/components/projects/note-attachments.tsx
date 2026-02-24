"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Paperclip,
  Download,
  Trash2,
  Image as ImageIcon,
  FileText,
  Loader2,
  Copy,
  ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getNoteAttachments,
  attachFileToNote,
  detachFileFromNote,
  type NoteAttachmentItemWithUrl,
} from "@/actions/notes";
import {
  getPersonalNoteAttachments,
  attachFileToPersonalNote,
  detachFileFromPersonalNote,
  type PersonalNoteAttachmentItemWithUrl,
} from "@/actions/personal";
import {
  prepareFileUpload,
  completeFileUpload,
} from "@/actions/files";
import {
  preparePersonalFileUpload,
  completePersonalFileUpload,
} from "@/actions/personal";

type AttachmentItem = NoteAttachmentItemWithUrl | PersonalNoteAttachmentItemWithUrl;

const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

function isImageType(type: string, name: string): boolean {
  if (type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|svg)$/i.test(name);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type NoteAttachmentsProps = {
  /** null = personal notes */
  projectId: string | null;
  noteId: string;
  /** Callback to insert markdown image into note content */
  onInsertImage?: (markdown: string) => void;
  /** Whether the user can modify attachments (edit mode) */
  editable?: boolean;
};

export function NoteAttachments({
  projectId,
  noteId,
  onInsertImage,
  editable = true,
}: NoteAttachmentsProps) {
  const t = useTranslations("projects.notes.attachments");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isPersonal = projectId === null;

  const loadAttachments = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = isPersonal
        ? await getPersonalNoteAttachments(noteId)
        : await getNoteAttachments(projectId, noteId);
      if (result.success) {
        setAttachments(result.attachments);
      }
    } finally {
      setIsLoading(false);
    }
  }, [projectId, noteId, isPersonal]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  const handleUploadAndAttach = async (file: File) => {
    setIsUploading(true);
    try {
      // Step 1: Prepare upload
      const prepResult = isPersonal
        ? await preparePersonalFileUpload({
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          })
        : await prepareFileUpload({
            projectId: projectId!,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          });

      if (!prepResult.success) {
        alert(t("attachError"));
        return;
      }

      // Step 2: Upload to MinIO via presigned URL
      const uploadResponse = await fetch(prepResult.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadResponse.ok) {
        alert(t("attachError"));
        return;
      }

      // Step 3: Complete upload (create File record)
      const completeResult = isPersonal
        ? await completePersonalFileUpload({
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            bucket: prepResult.bucket,
            key: prepResult.key,
          })
        : await completeFileUpload({
            projectId: projectId!,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            bucket: prepResult.bucket,
            key: prepResult.key,
          });

      if (!completeResult.success) {
        alert(t("attachError"));
        return;
      }

      // Step 4: Attach file to note
      const attachResult = isPersonal
        ? await attachFileToPersonalNote(noteId, completeResult.file.id)
        : await attachFileToNote(projectId!, noteId, completeResult.file.id);

      if (!attachResult.success) {
        alert(t("attachError"));
        return;
      }

      // Reload attachments
      await loadAttachments();
    } catch {
      alert(t("attachError"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Upload all selected files
    Array.from(files).forEach((file) => {
      handleUploadAndAttach(file);
    });

    // Reset input
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleRemove = (attachment: AttachmentItem) => {
    if (!confirm(t("confirmRemove"))) return;
    startTransition(async () => {
      const result = isPersonal
        ? await detachFileFromPersonalNote(noteId, attachment.fileId)
        : await detachFileFromNote(projectId!, noteId, attachment.fileId);
      if (result.success) {
        setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      } else {
        alert(t("removeError"));
      }
    });
  };

  const handleCopyImageUrl = async (attachment: AttachmentItem) => {
    try {
      await navigator.clipboard.writeText(attachment.downloadUrl);
    } catch {
      // Fallback: select text
    }
  };

  const handleInsertImage = (attachment: AttachmentItem) => {
    if (onInsertImage) {
      const markdown = `![${attachment.fileName}](${attachment.downloadUrl})`;
      onInsertImage(markdown);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="size-4" />
          {t("title")}
          {attachments.length > 0 && (
            <span className="text-muted-foreground">({attachments.length})</span>
          )}
        </h4>
        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 min-h-[44px] min-w-[44px] gap-1.5 text-xs"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading || isPending}
            >
              {isUploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Paperclip className="size-3.5" />
              )}
              {isUploading ? t("uploading") : t("attach")}
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-12 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : attachments.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          {t("noAttachments")}
        </p>
      ) : (
        <div className="space-y-1">
          {attachments.map((attachment) => {
            const isImage = isImageType(attachment.fileType, attachment.fileName);
            return (
              <div
                key={attachment.id}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                {isImage ? (
                  <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{attachment.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(attachment.fileSize)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {/* Download */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 min-h-[44px] min-w-[44px]"
                    asChild
                  >
                    <a
                      href={attachment.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t("download")}
                    >
                      <Download className="size-4" />
                    </a>
                  </Button>
                  {/* Copy image URL (for images) */}
                  {isImage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 min-h-[44px] min-w-[44px]"
                      onClick={() => handleCopyImageUrl(attachment)}
                      title={t("copyImageUrl")}
                    >
                      <Copy className="size-4" />
                    </Button>
                  )}
                  {/* Insert image into content */}
                  {isImage && onInsertImage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 min-h-[44px] min-w-[44px]"
                      onClick={() => handleInsertImage(attachment)}
                      title={t("insertImage")}
                    >
                      <ImagePlus className="size-4" />
                    </Button>
                  )}
                  {/* Remove */}
                  {editable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 min-h-[44px] min-w-[44px] text-destructive hover:text-destructive"
                      onClick={() => handleRemove(attachment)}
                      disabled={isPending}
                      title={t("remove")}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
