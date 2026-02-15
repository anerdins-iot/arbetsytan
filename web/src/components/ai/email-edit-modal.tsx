"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileText, Paperclip, X } from "lucide-react";
import { AttachFilesButton, type EmailAttachment } from "./email-attachment-picker";
import type { EmailPreviewData } from "./email-preview-card";

type EmailEditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: EmailPreviewData;
  onSave: (updatedData: EmailPreviewData) => void;
};

export function EmailEditModal({ open, onOpenChange, data, onSave }: EmailEditModalProps) {
  const [recipients, setRecipients] = useState(data.recipients.join(", "));
  const [subject, setSubject] = useState(data.subject);
  const [body, setBody] = useState(data.body);
  const [attachments, setAttachments] = useState<EmailAttachment[]>(data.attachments ?? []);

  const handleSave = () => {
    const parsedRecipients = recipients
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && e.includes("@"));

    onSave({
      ...data,
      recipients: parsedRecipients,
      subject,
      body,
      attachments,
    });
    onOpenChange(false);
  };

  const handleCancel = () => {
    // Reset to original data
    setRecipients(data.recipients.join(", "));
    setSubject(data.subject);
    setBody(data.body);
    setAttachments(data.attachments ?? []);
    onOpenChange(false);
  };

  const removeAttachment = (fileId: string) => {
    setAttachments(attachments.filter((a) => a.fileId !== fileId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Redigera e-post</DialogTitle>
          <DialogDescription>
            Ändra mottagare, ämne och meddelande innan du skickar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Recipients */}
          <div className="space-y-2">
            <Label htmlFor="edit-recipients">Mottagare</Label>
            <Input
              id="edit-recipients"
              placeholder="namn@example.com, namn2@example.com"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Separera flera adresser med komma
            </p>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="edit-subject">Ämne</Label>
            <Input
              id="edit-subject"
              placeholder="Ämne"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="edit-body">Meddelande</Label>
            <Textarea
              id="edit-body"
              placeholder="Skriv ditt meddelande..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[300px]"
            />
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" />
                Bilagor
              </Label>
              <AttachFilesButton
                selectedFiles={attachments}
                onFilesChange={setAttachments}
              />
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 rounded-md bg-muted/50 p-3">
                {attachments.map((file) => (
                  <Badge
                    key={file.fileId}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    <FileText className="h-3 w-3" />
                    {file.fileName}
                    <button
                      type="button"
                      onClick={() => removeAttachment(file.fileId)}
                      className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Avbryt
          </Button>
          <Button onClick={handleSave}>
            Spara ändringar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
