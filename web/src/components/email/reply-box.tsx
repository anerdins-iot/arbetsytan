"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";

type ReplyBoxProps = {
  onSend: (bodyText: string, bodyHtml: string) => Promise<void>;
  isPending: boolean;
};

export function ReplyBox({ onSend, isPending }: ReplyBoxProps) {
  const t = useTranslations("email.inbox");
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    const text = body.trim();
    if (!text) return;
    const html = `<p>${text.replace(/\n/g, "<br>")}</p>`;
    await onSend(text, html);
    setBody("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border p-4 bg-card">
      <div className="flex gap-3 items-end">
        <Textarea
          ref={textareaRef}
          placeholder={t("replyPlaceholder")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[60px] max-h-[160px] resize-none flex-1 text-sm"
          disabled={isPending}
          rows={2}
        />
        <Button
          onClick={handleSend}
          disabled={!body.trim() || isPending}
          size="icon"
          className="bg-accent text-accent-foreground hover:bg-accent/90 h-10 w-10 shrink-0"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          <span className="sr-only">{t("sendReply")}</span>
        </Button>
      </div>
    </div>
  );
}
