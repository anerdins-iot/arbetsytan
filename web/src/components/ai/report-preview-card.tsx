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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  FileText,
  FileSpreadsheet,
  FileIcon,
  FolderOpen,
  Check,
  X,
  Loader2,
  Pencil,
  Download,
  List,
  Table,
  AlignLeft,
} from "lucide-react";
import { MarkdownMessage } from "@/components/ai/markdown-message";

export type ReportSection = {
  title: string;
  content: string;
  type: "text" | "table" | "list";
  data?: string[][];
};

export type ReportPreviewData = {
  title: string;
  summary: string;
  sections: ReportSection[];
  projectId?: string;
  projectName?: string;
  format: "pdf" | "excel" | "word";
};

type Props = {
  data: ReportPreviewData;
  onGenerate: (data: ReportPreviewData) => Promise<{ success: boolean; error?: string; downloadUrl?: string; fileId?: string }>;
  onCancel?: () => void;
};

function getFormatIcon(format: "pdf" | "excel" | "word") {
  switch (format) {
    case "pdf":
      return <FileText className="h-4 w-4 text-red-500" />;
    case "excel":
      return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
    case "word":
      return <FileIcon className="h-4 w-4 text-blue-600" />;
  }
}

function getFormatBadge(format: "pdf" | "excel" | "word") {
  switch (format) {
    case "pdf":
      return { label: "PDF", color: "destructive" as const };
    case "excel":
      return { label: "Excel", color: "default" as const };
    case "word":
      return { label: "Word", color: "secondary" as const };
  }
}

function getSectionIcon(type: "text" | "table" | "list") {
  switch (type) {
    case "text":
      return <AlignLeft className="h-3 w-3" />;
    case "table":
      return <Table className="h-3 w-3" />;
    case "list":
      return <List className="h-3 w-3" />;
  }
}

export function ReportPreviewCard({ data, onGenerate, onCancel }: Props) {
  const [status, setStatus] = useState<"pending" | "generating" | "done" | "error">("pending");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editedData, setEditedData] = useState<ReportPreviewData>(data);

  const handleGenerate = async () => {
    setStatus("generating");
    setError(null);

    try {
      const result = await onGenerate(editedData);
      if (result.success) {
        setStatus("done");
        if (result.downloadUrl) setDownloadUrl(result.downloadUrl);
      } else {
        setStatus("error");
        setError(result.error ?? "Kunde inte generera rapporten");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Ett oväntat fel uppstod");
    }
  };

  const badge = getFormatBadge(editedData.format);

  return (
    <>
      <Card className="w-full max-w-lg border-primary/20 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-primary/10 p-2">
                {getFormatIcon(editedData.format)}
              </div>
              <div>
                <CardTitle className="text-base">Rapport redo att genereras</CardTitle>
                <CardDescription className="text-xs">
                  Granska och bekräfta innan rapporten skapas
                </CardDescription>
              </div>
            </div>
            <Badge variant={badge.color}>{badge.label}</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pb-3">
          {/* Project name */}
          {editedData.projectName && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Projekt</p>
              <p className="text-sm font-medium flex items-center gap-1">
                <FolderOpen className="h-3 w-3 text-primary" />
                {editedData.projectName}
              </p>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Titel</p>
            <p className="text-sm font-medium">{editedData.title}</p>
          </div>

          {/* Summary */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Sammanfattning</p>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                {editedData.summary}
              </p>
            </div>
          </div>

          {/* Sections preview */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Sektioner ({editedData.sections.length})
            </p>
            <div className="space-y-1.5">
              {editedData.sections.map((section, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2"
                >
                  {getSectionIcon(section.type)}
                  <span className="text-sm">{section.title}</span>
                  <Badge variant="outline" className="ml-auto text-xs font-normal">
                    {section.type === "text"
                      ? "Text"
                      : section.type === "table"
                        ? "Tabell"
                        : "Lista"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Status messages */}
          {status === "done" && (
            <div className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-success">
              <Check className="h-4 w-4" />
              <span className="text-sm font-medium">Rapport genererad!</span>
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
                onClick={handleGenerate}
              >
                <Download className="h-4 w-4" />
                Generera rapport
              </Button>
            </>
          )}

          {status === "generating" && (
            <Button size="sm" disabled className="ml-auto gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Genererar...
            </Button>
          )}

          {status === "done" && (
            <div className="flex items-center gap-2 w-full">
              <p className="text-xs text-muted-foreground">Rapporten sparad i fillistan</p>
              {downloadUrl && (
                <Button
                  size="sm"
                  variant="default"
                  className="ml-auto gap-2"
                  asChild
                >
                  <a href={downloadUrl} download target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" />
                    Ladda ner
                  </a>
                </Button>
              )}
            </div>
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

      {/* Edit Modal */}
      <ReportEditModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        data={editedData}
        onSave={setEditedData}
      />
    </>
  );
}

// ─── Edit Modal ──────────────────────────────────────────────────

type EditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReportPreviewData;
  onSave: (data: ReportPreviewData) => void;
};

function ReportEditModal({ open, onOpenChange, data, onSave }: EditModalProps) {
  const [title, setTitle] = useState(data.title);
  const [summary, setSummary] = useState(data.summary);
  const [sections, setSections] = useState<ReportSection[]>(data.sections);

  const handleSave = () => {
    onSave({ ...data, title, summary, sections });
    onOpenChange(false);
  };

  const updateSection = (idx: number, updates: Partial<ReportSection>) => {
    setSections((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...updates } : s))
    );
  };

  const removeSection = (idx: number) => {
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Redigera rapport</DialogTitle>
          <DialogDescription>
            Justera titel, sammanfattning och sektioner innan du genererar rapporten
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="report-title">Titel</Label>
            <Input
              id="report-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Summary */}
          <div className="space-y-2">
            <Label htmlFor="report-summary">Sammanfattning</Label>
            <Textarea
              id="report-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
            />
          </div>

          {/* Sections */}
          <div className="space-y-3">
            <Label>Sektioner</Label>
            {sections.map((section, idx) => (
              <div key={idx} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <Input
                    value={section.title}
                    onChange={(e) => updateSection(idx, { title: e.target.value })}
                    className="max-w-[70%]"
                    placeholder="Sektionsrubrik"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeSection(idx)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  value={section.content}
                  onChange={(e) => updateSection(idx, { content: e.target.value })}
                  rows={4}
                  placeholder="Sektionsinnehåll (markdown stöds)"
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSave}>Spara ändringar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
