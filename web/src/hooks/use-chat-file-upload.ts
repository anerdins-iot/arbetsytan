"use client";

import { useCallback, useState } from "react";
import type { RefObject } from "react";
import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
} from "@/components/ai/personal-ai-chat-constants";
import type { UploadedFile } from "@/components/ai/personal-ai-chat-types";

type TranslationFn = (key: string) => string;

export function useChatFileUpload(
  conversationId: string | null,
  activeProjectIdRef: RefObject<string | null>,
  t: TranslationFn
) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const uploadFile = useCallback(
    async (file: File) => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const isImage = file.type.startsWith("image/");
      const tempUrl = isImage ? URL.createObjectURL(file) : undefined;

      const uploadEntry: UploadedFile = {
        id: tempId,
        name: file.name,
        type: file.type,
        size: file.size,
        status: "uploading",
        thumbnailUrl: tempUrl,
      };

      setUploadedFiles((prev) => [...prev, uploadEntry]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("chatMode", "true");
        if (conversationId) {
          formData.append("conversationId", conversationId);
        }
        if (activeProjectIdRef.current) {
          formData.append("projectId", activeProjectIdRef.current);
        }

        const res = await fetch("/api/ai/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(data.error || "Upload failed");
        }

        const data = await res.json();

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? {
                  ...f,
                  id: data.file.id,
                  status: "done" as const,
                  url: data.file.url,
                  ocrText: data.file.ocrText ?? null,
                  thumbnailUrl: isImage ? (data.file.url ?? tempUrl) : undefined,
                }
              : f
          )
        );

        if (tempUrl && data.file.url) {
          URL.revokeObjectURL(tempUrl);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Upload failed";
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? { ...f, status: "error" as const, error: errorMsg }
              : f
          )
        );
        if (tempUrl) URL.revokeObjectURL(tempUrl);
      }
    },
    [conversationId, activeProjectIdRef]
  );

  const handleFileSelect = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        if (file.size > MAX_FILE_SIZE) {
          setUploadedFiles((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: file.name,
              type: file.type,
              size: file.size,
              status: "error",
              error: t("fileTooLarge"),
            },
          ]);
          continue;
        }
        if (!ALLOWED_EXTENSIONS.test(file.name)) {
          setUploadedFiles((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: file.name,
              type: file.type,
              size: file.size,
              status: "error",
              error: t("fileTypeNotAllowed"),
            },
          ]);
          continue;
        }
        void uploadFile(file);
      }
    },
    [uploadFile, t]
  );

  const removeUploadedFile = useCallback((fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  return {
    uploadedFiles,
    setUploadedFiles,
    uploadFile,
    handleFileSelect,
    removeUploadedFile,
  };
}
