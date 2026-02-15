"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Download, Eye, FileSpreadsheet, Check, X, Loader2, FileIcon } from "lucide-react";

export type FileCreatedData = {
  fileId: string;
  fileName: string;
  fileType: "pdf" | "excel" | "word";
  fileSize?: number;
  downloadUrl?: string;
  previewUrl?: string;
  message?: string;
};

type Props = {
  data: FileCreatedData;
  onDownload?: () => Promise<{ success: boolean; error?: string }>;
};

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: "pdf" | "excel" | "word") {
  switch (fileType) {
    case "pdf":
      return <FileText className="h-5 w-5 text-red-500" />;
    case "excel":
      return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
    case "word":
      return <FileIcon className="h-5 w-5 text-blue-600" />;
  }
}

function getFileTypeBadge(fileType: "pdf" | "excel" | "word") {
  switch (fileType) {
    case "pdf":
      return { label: "PDF", color: "destructive" as const };
    case "excel":
      return { label: "Excel", color: "default" as const };
    case "word":
      return { label: "Word", color: "secondary" as const };
  }
}

export function FileCreatedCard({ data, onDownload }: Props) {
  const [status, setStatus] = useState<"pending" | "downloading" | "downloaded" | "error">("pending");
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleDownload = async () => {
    if (data.downloadUrl) {
      // Direct download via link
      window.open(data.downloadUrl, "_blank");
      setStatus("downloaded");
      return;
    }

    if (onDownload) {
      setStatus("downloading");
      setError(null);

      try {
        const result = await onDownload();
        if (result.success) {
          setStatus("downloaded");
        } else {
          setStatus("error");
          setError(result.error ?? "Kunde inte ladda ner filen");
        }
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Ett oväntat fel uppstod");
      }
    }
  };

  const handlePreview = () => {
    if (data.previewUrl) {
      window.open(data.previewUrl, "_blank");
    } else if (data.downloadUrl) {
      // For PDF, we can show inline preview
      if (data.fileType === "pdf") {
        setShowPreview(true);
      } else {
        // For Excel/Word, just download
        handleDownload();
      }
    }
  };

  const badge = getFileTypeBadge(data.fileType);
  const canPreview = data.fileType === "pdf" && (data.previewUrl || data.downloadUrl);

  return (
    <>
      <Card className="w-full max-w-lg border-primary/20 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-primary/10 p-2">
                {getFileIcon(data.fileType)}
              </div>
              <div>
                <CardTitle className="text-base">Fil skapad</CardTitle>
                <CardDescription className="text-xs">
                  {data.message || "Din fil är redo att laddas ner"}
                </CardDescription>
              </div>
            </div>
            <Badge variant={badge.color}>{badge.label}</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pb-3">
          {/* File info */}
          <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
            {getFileIcon(data.fileType)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{data.fileName}</p>
              {data.fileSize && (
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(data.fileSize)}
                </p>
              )}
            </div>
          </div>

          {/* Status messages */}
          {status === "downloaded" && (
            <div className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-success">
              <Check className="h-4 w-4" />
              <span className="text-sm font-medium">Fil nedladdad!</span>
            </div>
          )}

          {status === "error" && error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
              <X className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex gap-2 pt-0">
          {status === "pending" && (
            <>
              {canPreview && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handlePreview}
                >
                  <Eye className="h-4 w-4" />
                  Förhandsgranska
                </Button>
              )}
              <Button
                size="sm"
                className="ml-auto gap-2"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4" />
                Ladda ner
              </Button>
            </>
          )}

          {status === "downloading" && (
            <Button size="sm" disabled className="ml-auto gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Laddar ner...
            </Button>
          )}

          {status === "downloaded" && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto gap-2"
              onClick={handleDownload}
            >
              <Download className="h-4 w-4" />
              Ladda ner igen
            </Button>
          )}

          {status === "error" && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setStatus("pending")}
            >
              Försök igen
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* PDF Preview Dialog */}
      {data.fileType === "pdf" && (
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Förhandsgranskning</DialogTitle>
              <DialogDescription>{data.fileName}</DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-border bg-white overflow-hidden">
              {(data.previewUrl || data.downloadUrl) && (
                <iframe
                  src={data.previewUrl || data.downloadUrl}
                  className="w-full h-[600px]"
                  title="PDF förhandsgranskning"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
