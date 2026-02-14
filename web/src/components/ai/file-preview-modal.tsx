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
import { getFilePreviewData } from "@/actions/files";

const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp)/i;
const PDF_TYPE = "application/pdf";

type FilePreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  fileName: string;
  projectId: string | null;
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

  useEffect(() => {
    if (!open || !fileId) return;
    setLoading(true);
    setError(null);
    setDownloadUrl(null);
    setFileType(null);
    setOcrText(null);

    getFilePreviewData({
      fileId,
      projectId: projectId ?? undefined,
    })
      .then((res) => {
        if (!res.success) {
          setError(res.error);
          return;
        }
        setDownloadUrl(res.file.downloadUrl);
        setFileType(res.file.type);
        setOcrText(res.file.ocrText);
      })
      .catch(() => setError("FETCH_FILE_FAILED"))
      .finally(() => setLoading(false));
  }, [open, fileId, projectId]);

  const isImage = fileType ? IMAGE_TYPES.test(fileType) : false;
  const isPdf = fileType === PDF_TYPE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-2xl">
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
              <div className="flex min-h-0 flex-1 justify-center overflow-auto rounded-md border border-border bg-muted/30 p-2">
                <img
                  src={downloadUrl}
                  alt={fileName}
                  className="max-h-[60vh] max-w-full object-contain"
                />
              </div>
            )}

            {/* PDF: iframe eller OCR-text */}
            {isPdf && (
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                {ocrText ? (
                  <div className="max-h-[50vh] overflow-auto rounded-md border border-border bg-muted/30 p-4 text-sm text-foreground">
                    <pre className="whitespace-pre-wrap font-sans">
                      {ocrText}
                    </pre>
                  </div>
                ) : (
                  <div className="min-h-[50vh] overflow-hidden rounded-md border border-border">
                    <iframe
                      src={downloadUrl}
                      title={fileName}
                      className="h-[50vh] w-full border-0"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Övriga filer: bara nedladdning */}
            {!isImage && !isPdf && (
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
