"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  FileText,
  Image as ImageIcon,
  Search,
  FolderOpen,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FilePreviewModal } from "@/components/ai/file-preview-modal";

export type SearchResult = {
  fileId: string;
  fileName: string;
  projectId: string | null;
  projectName: string | null;
  page: number | null;
  similarity: number;
  excerpt: string;
  previewUrl?: string;
  type?: string;
};

type Props = {
  results: SearchResult[];
};

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp)/i;

function isImageFile(fileName: string, type?: string) {
  if (type && IMAGE_TYPES.test(type)) return true;
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.includes(ext) : false;
}

function getFileIcon(fileName: string) {
  if (isImageFile(fileName)) {
    return <ImageIcon className="size-4 shrink-0 text-muted-foreground" />;
  }
  return <FileText className="size-4 shrink-0 text-muted-foreground" />;
}

export function SearchResultsCard({ results }: Props) {
  const t = useTranslations("personalAi.searchResults");
  const [expanded, setExpanded] = useState(true);
  const [previewFile, setPreviewFile] = useState<SearchResult | null>(null);

  if (!results || results.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="w-full max-w-lg border-primary/20 bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-primary/10 p-2">
                <Search className="size-4 text-primary" />
              </div>
              <CardTitle className="text-base">
                {t("title", { count: results.length })}
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </Button>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="space-y-1 pt-0">
            {results.map((result, i) => {
              const similarity = Math.round(result.similarity * 100);
              const showImageThumb =
                result.previewUrl &&
                isImageFile(result.fileName, result.type);
              return (
                <button
                  key={`${result.fileId}-${i}`}
                  type="button"
                  className="flex w-full flex-col gap-1 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-muted/50"
                  onClick={() => setPreviewFile(result)}
                >
                  <div className="flex items-center gap-2">
                    {showImageThumb ? (
                      <img
                        src={result.previewUrl}
                        alt=""
                        className="size-10 shrink-0 rounded object-cover"
                      />
                    ) : (
                      getFileIcon(result.fileName)
                    )}
                    <span className="flex-1 truncate text-sm font-medium text-foreground">
                      {result.fileName}
                    </span>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {similarity}%
                    </Badge>
                  </div>

                  {result.projectName && (
                    <div className="flex items-center gap-1 pl-6">
                      <FolderOpen className="size-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {result.projectName}
                      </span>
                      {result.page != null && (
                        <span className="text-xs text-muted-foreground">
                          · {t("page", { page: result.page })}
                        </span>
                      )}
                    </div>
                  )}

                  {result.excerpt && (
                    <p className="line-clamp-2 pl-6 text-xs text-muted-foreground">
                      {result.excerpt}
                    </p>
                  )}
                </button>
              );
            })}
          </CardContent>
        )}
      </Card>

      {previewFile && (
        <FilePreviewModal
          open={!!previewFile}
          onOpenChange={(open) => {
            if (!open) setPreviewFile(null);
          }}
          fileId={previewFile.fileId}
          fileName={previewFile.fileName}
          projectId={previewFile.projectId}
        />
      )}
    </>
  );
}
