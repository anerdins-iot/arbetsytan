"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Plus } from "lucide-react";
import { FilePicker, FilePickerButton, type SelectedFile } from "@/components/files/file-picker";
import type { EmailAttachment } from "@/components/ai/email-preview-card";

// Re-export for convenience
export type { EmailAttachment };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFiles: EmailAttachment[];
  onFilesChange: (files: EmailAttachment[]) => void;
};

// Convert between EmailAttachment and SelectedFile formats
function toSelectedFile(attachment: EmailAttachment): SelectedFile {
  return {
    fileId: attachment.fileId,
    fileName: attachment.fileName,
    source: attachment.source,
    projectId: attachment.projectId,
  };
}

function toEmailAttachment(file: SelectedFile): EmailAttachment {
  return {
    fileId: file.fileId,
    fileName: file.fileName,
    source: file.source,
    projectId: file.projectId,
  };
}

/**
 * Email attachment picker dialog.
 * Uses the general FilePicker component with email-specific title and description.
 */
export function EmailAttachmentPicker({
  open,
  onOpenChange,
  selectedFiles,
  onFilesChange,
}: Props) {
  return (
    <FilePicker
      open={open}
      onOpenChange={onOpenChange}
      selectedFiles={selectedFiles.map(toSelectedFile)}
      onFilesChange={(files) => onFilesChange(files.map(toEmailAttachment))}
      title="Bifoga filer"
      description="Välj filer från din personliga lagring eller projektmappar att bifoga till e-posten"
      tabs={["personal", "project"]}
      multiple={true}
    />
  );
}

/**
 * Button to open the email attachment picker.
 * Shows a paperclip icon and the number of selected files.
 */
export function AttachFilesButton({
  selectedFiles,
  onFilesChange,
}: {
  selectedFiles: EmailAttachment[];
  onFilesChange: (files: EmailAttachment[]) => void;
  tenantId?: string; // kept for API compatibility, not used
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        <Paperclip className="h-4 w-4" />
        {selectedFiles.length > 0 ? `${selectedFiles.length} filer` : "Bifoga filer"}
      </Button>

      <EmailAttachmentPicker
        open={open}
        onOpenChange={setOpen}
        selectedFiles={selectedFiles}
        onFilesChange={onFilesChange}
      />
    </>
  );
}
