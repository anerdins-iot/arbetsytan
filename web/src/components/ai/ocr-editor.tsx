"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type OcrEditorProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  loading?: boolean;
};

export function OcrEditor({ value, onChange, className, loading }: OcrEditorProps) {
  const t = useTranslations("personalAi.fileAnalysis");
  const [copied, setCopied] = useState(false);
  const [isEdited, setIsEdited] = useState(false);

  const handleChange = (newValue: string) => {
    setIsEdited(true);
    onChange(newValue);
  };

  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor="ocr-text" className="text-sm font-medium">
          {t("extractedText")}
        </Label>
        <div className="flex items-center gap-1.5">
          {loading && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {t("extractingText")}
            </span>
          )}
          {isEdited && !loading && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Pencil className="size-3" />
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleCopy}
            disabled={!value || loading}
          >
            {copied ? (
              <Check className="size-3.5 text-primary" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
      <Textarea
        id="ocr-text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={loading ? t("extractingTextPlaceholder") : t("extractedTextPlaceholder")}
        rows={5}
        className="resize-none text-sm"
        disabled={loading}
      />
    </div>
  );
}
