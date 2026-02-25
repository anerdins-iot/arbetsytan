"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import { Mail, Send, Eye, Users, ExternalLink, Check, X, Loader2, Paperclip, FileText, FolderOpen, Building2, Pencil } from "lucide-react";
import { EmailEditModal } from "./email-edit-modal";

export type EmailAttachment = {
  fileId: string;
  fileName: string;
  source: "personal" | "project";
  projectId?: string;
};

export type EmailPreviewData = {
  type: "external" | "team" | "project";
  recipients: string[];
  recipientNames?: string[]; // Display names for team/project members
  subject: string;
  body: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  // For project type
  projectId?: string;
  projectName?: string;
  // For rendering in chat
  previewHtml?: string;
};

type Props = {
  data: EmailPreviewData;
  onSend: () => Promise<{ success: boolean; error?: string }>;
  onCancel?: () => void;
};

export function EmailPreviewCard({ data, onSend, onCancel }: Props) {
  const [status, setStatus] = useState<"pending" | "sending" | "sent" | "error">("pending");
  const [error, setError] = useState<string | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editedData, setEditedData] = useState<EmailPreviewData>(data);

  const handleSend = async () => {
    setStatus("sending");
    setError(null);

    try {
      const result = await onSend();
      if (result.success) {
        setStatus("sent");
      } else {
        setStatus("error");
        setError(result.error ?? "Kunde inte skicka e-post");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Ett oväntat fel uppstod");
    }
  };

  const recipientLabel = editedData.type === "project"
    ? "Projektmedlemmar"
    : editedData.type === "team"
      ? "Teammedlemmar (hela företaget)"
      : "Externa mottagare";
  const Icon = editedData.type === "project"
    ? FolderOpen
    : editedData.type === "team"
      ? Building2
      : ExternalLink;
  const badgeLabel = editedData.type === "project"
    ? "Projekt"
    : editedData.type === "team"
      ? "Företag"
      : "Extern";
  const badgeColor = editedData.type === "project"
    ? "default"
    : editedData.type === "team"
      ? "secondary"
      : "outline";

  // Use names if available, otherwise emails
  const displayRecipients = editedData.recipientNames && editedData.recipientNames.length > 0
    ? editedData.recipientNames
    : editedData.recipients;

  return (
    <>
      <Card className="w-full max-w-lg border-primary/20 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-primary/10 p-2">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">E-post redo att skickas</CardTitle>
                <CardDescription className="text-xs">
                  Granska och bekräfta innan du skickar
                </CardDescription>
              </div>
            </div>
            <Badge variant={badgeColor} className="gap-1">
              <Icon className="h-3 w-3" />
              {badgeLabel}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pb-3">
          {/* Project name if project type */}
          {editedData.type === "project" && editedData.projectName && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Projekt</p>
              <p className="text-sm font-medium flex items-center gap-1">
                <FolderOpen className="h-3 w-3 text-primary" />
                {editedData.projectName}
              </p>
            </div>
          )}

          {/* Recipients */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{recipientLabel}</p>
            <div className="flex flex-wrap gap-1">
              {displayRecipients.slice(0, 4).map((r, i) => (
                <Badge key={i} variant="outline" className="text-xs font-normal">
                  {r}
                </Badge>
              ))}
              {displayRecipients.length > 4 && (
                <Badge variant="outline" className="text-xs font-normal">
                  +{displayRecipients.length - 4} till
                </Badge>
              )}
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Ämne</p>
            <p className="text-sm font-medium">{editedData.subject}</p>
          </div>

          {/* Body preview (markdown rendered like outgoing email) */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Meddelande</p>
            <div className="rounded-md bg-muted/50 p-3 line-clamp-3 overflow-hidden">
              <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground text-sm prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {editedData.body}
                </ReactMarkdown>
              </div>
            </div>
          </div>

          {/* Attachments */}
          {editedData.attachments && editedData.attachments.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                Bifogade filer ({editedData.attachments.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {editedData.attachments.map((file, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 text-xs font-normal">
                    <FileText className="h-3 w-3" />
                    {file.fileName}
                    <span className="text-muted-foreground">
                      ({file.source === "personal" ? "personlig" : "projekt"})
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Status messages */}
          {status === "sent" && (
            <div className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-success">
              <Check className="h-4 w-4" />
              <span className="text-sm font-medium">E-post skickad!</span>
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
              {editedData.previewHtml && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowFullPreview(true)}
                >
                  <Eye className="h-4 w-4" />
                  Visa preview
                </Button>
              )}
              {onCancel && (
                <Button variant="ghost" size="sm" onClick={onCancel}>
                  Avbryt
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto gap-2"
                onClick={() => setShowEditModal(true)}
              >
                <Pencil className="h-4 w-4" />
                Redigera
              </Button>
              <Button
                size="sm"
                className="gap-2"
                onClick={handleSend}
              >
                <Send className="h-4 w-4" />
                Skicka e-post
              </Button>
            </>
          )}

          {status === "sending" && (
            <Button size="sm" disabled className="ml-auto gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Skickar...
            </Button>
          )}

          {status === "sent" && (
            <p className="ml-auto text-xs text-muted-foreground">
              Skickat till {editedData.recipients.length} mottagare
            </p>
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

      {/* Full HTML preview dialog */}
      <Dialog open={showFullPreview} onOpenChange={setShowFullPreview}>
        <DialogContent className="max-w-[calc(100%-2rem)] max-h-[90vh] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>E-postförhandsgranskning</DialogTitle>
            <DialogDescription>
              Så här kommer mailet att se ut för mottagaren
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-white overflow-hidden">
            {editedData.previewHtml && (
              <iframe
                srcDoc={editedData.previewHtml}
                className="w-full h-[500px]"
                title="E-postförhandsgranskning"
                sandbox="allow-same-origin"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit email modal */}
      <EmailEditModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        data={editedData}
        onSave={setEditedData}
      />
    </>
  );
}
