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
import { Mail, Send, Eye, Users, ExternalLink, Check, X, Loader2, Paperclip, FileText, FolderOpen, Building2 } from "lucide-react";

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

  const recipientLabel = data.type === "project"
    ? "Projektmedlemmar"
    : data.type === "team"
      ? "Teammedlemmar (hela företaget)"
      : "Externa mottagare";
  const Icon = data.type === "project"
    ? FolderOpen
    : data.type === "team"
      ? Building2
      : ExternalLink;
  const badgeLabel = data.type === "project"
    ? "Projekt"
    : data.type === "team"
      ? "Företag"
      : "Extern";
  const badgeColor = data.type === "project"
    ? "default"
    : data.type === "team"
      ? "secondary"
      : "outline";

  // Use names if available, otherwise emails
  const displayRecipients = data.recipientNames && data.recipientNames.length > 0
    ? data.recipientNames
    : data.recipients;

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
          {data.type === "project" && data.projectName && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Projekt</p>
              <p className="text-sm font-medium flex items-center gap-1">
                <FolderOpen className="h-3 w-3 text-primary" />
                {data.projectName}
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
            <p className="text-sm font-medium">{data.subject}</p>
          </div>

          {/* Body preview */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Meddelande</p>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                {data.body}
              </p>
            </div>
          </div>

          {/* Attachments */}
          {data.attachments && data.attachments.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                Bifogade filer ({data.attachments.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {data.attachments.map((file, i) => (
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
              {data.previewHtml && (
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
                size="sm"
                className="ml-auto gap-2"
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
              Skickat till {data.recipients.length} mottagare
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
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>E-postförhandsgranskning</DialogTitle>
            <DialogDescription>
              Så här kommer mailet att se ut för mottagaren
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-white overflow-hidden">
            {data.previewHtml && (
              <iframe
                srcDoc={data.previewHtml}
                className="w-full h-[500px]"
                title="E-postförhandsgranskning"
                sandbox="allow-same-origin"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
