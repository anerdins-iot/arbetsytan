"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Loader2, AlertCircle, Check } from "lucide-react";
import { createConversation } from "@/actions/email-conversations";

type ProjectOption = { id: string; name: string };

type NewConversationComposerProps = {
  projects: ProjectOption[];
  onSuccess?: (conversationId: string) => void;
};

export function NewConversationComposer({
  projects,
  onSuccess,
}: NewConversationComposerProps) {
  const t = useTranslations("email");
  const tInbox = useTranslations("email.inbox");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { success: true; conversationId: string } | { success: false; error: string } | null
  >(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    const email = to.trim();
    const subj = subject.trim();
    const body = message.trim();
    if (!email || !subj || !body) return;

    startTransition(async () => {
      const html = body.replace(/\n/g, "<br>");
      const res = await createConversation({
        externalEmail: email,
        subject: subj,
        bodyHtml: `<p>${html}</p>`,
        bodyText: body,
        projectId: projectId || undefined,
      });

      if (res.success) {
        setResult({ success: true, conversationId: res.conversation.id });
        setTo("");
        setSubject("");
        setMessage("");
        setProjectId("");
        onSuccess?.(res.conversation.id);
      } else {
        setResult({
          success: false,
          error: res.error === "USER_EMAIL_REQUIRED"
            ? t("errors.userEmailRequired")
            : res.error === "SEND_FAILED"
              ? t("errors.sendFailed")
              : res.error,
        });
      }
    });
  };

  const canSend =
    to.trim().length > 0 &&
    subject.trim().length > 0 &&
    message.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="new-conv-to">{tInbox("to")}</Label>
        <Input
          id="new-conv-to"
          type="email"
          placeholder={tInbox("toPlaceholder")}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-conv-subject">{t("subject")}</Label>
        <Input
          id="new-conv-subject"
          placeholder={t("subjectPlaceholder")}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-conv-project">{tInbox("linkToProject")}</Label>
        <Select value={projectId || "none"} onValueChange={(v) => setProjectId(v === "none" ? "" : v)}>
          <SelectTrigger id="new-conv-project">
            <SelectValue placeholder={tInbox("noProject")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{tInbox("noProject")}</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-conv-message">{t("message")}</Label>
        <Textarea
          id="new-conv-message"
          placeholder={t("messagePlaceholder")}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="min-h-[200px]"
          required
        />
      </div>
      {result && (
        <div
          className={`flex items-center gap-2 p-3 rounded-md text-sm ${
            result.success
              ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
          }`}
        >
          {result.success ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>
            {result.success
              ? t("success")
              : result.error}
          </span>
        </div>
      )}
      <Button type="submit" disabled={!canSend || isPending} size="lg" className="gap-2">
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("sending")}
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            {t("send")}
          </>
        )}
      </Button>
    </form>
  );
}
