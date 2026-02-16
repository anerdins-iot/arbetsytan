"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Edit, RotateCcw, Eye, Code, Check, X } from "lucide-react";
import {
  updateEmailTemplate,
  resetEmailTemplate,
  previewEmailTemplate,
  type EmailTemplateItem,
} from "@/actions/email-templates";
import type { TemplateName } from "@/lib/email-templates";

type Props = {
  templates: EmailTemplateItem[];
};

const TEMPLATE_LABELS: Record<TemplateName, { sv: string; en: string }> = {
  "password-reset": { sv: "Återställ lösenord", en: "Password Reset" },
  invitation: { sv: "Inbjudan", en: "Invitation" },
  "task-assigned": { sv: "Uppgift tilldelad", en: "Task Assigned" },
  "deadline-reminder": { sv: "Deadline-påminnelse", en: "Deadline Reminder" },
  "project-status-changed": {
    sv: "Projektstatus ändrad",
    en: "Project Status Changed",
  },
};

export function EmailTemplateManager({ templates }: Props) {
  const t = useTranslations("settings");
  const [selectedTemplate, setSelectedTemplate] =
    useState<EmailTemplateItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [editSubject, setEditSubject] = useState("");
  const [editHtml, setEditHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Sample data for live preview
  const sampleData: Record<string, string> = {
    appName: "ArbetsYtan",
    projectName: "Badrumsrenovering Svensson",
    projectUrl: "https://app.arbetsytan.se/sv/projects/demo",
    taskTitle: "Montera tvättställ",
    assignedBy: "Erik Johansson",
    deadline: "2026-02-20 10:00",
    previousStatus: "ACTIVE",
    newStatus: "PAUSED",
    inviteUrl: "https://app.arbetsytan.se/sv/invite/demo",
    tenantName: "Bygg & Montage AB",
    inviterName: "Anna Lindqvist",
    resetUrl: "https://app.arbetsytan.se/sv/reset-password?token=demo",
    locale: "sv",
    year: "2026",
  };

  // Apply sample variables to preview
  const getPreviewHtml = (html: string) => {
    let result = html;
    for (const [key, value] of Object.entries(sampleData)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
    return result;
  };

  const getPreviewSubject = (subject: string) => {
    let result = subject;
    for (const [key, value] of Object.entries(sampleData)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
    return result;
  };

  // Group templates by name
  const groupedTemplates = templates.reduce(
    (acc, template) => {
      if (!acc[template.name]) {
        acc[template.name] = [];
      }
      acc[template.name].push(template);
      return acc;
    },
    {} as Record<string, EmailTemplateItem[]>
  );

  const handleEdit = (template: EmailTemplateItem) => {
    setSelectedTemplate(template);
    setEditSubject(template.subject);
    setEditHtml(template.htmlTemplate);
    setIsEditing(true);
    setError(null);
    setSuccess(false);
  };

  const handlePreview = async (template: EmailTemplateItem) => {
    startTransition(async () => {
      const result = await previewEmailTemplate(template.name, template.locale);
      if (result) {
        setPreviewSubject(result.subject);
        setPreviewHtml(result.html);
        setIsPreviewOpen(true);
      }
    });
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;

    const formData = new FormData();
    formData.set("name", selectedTemplate.name);
    formData.set("locale", selectedTemplate.locale);
    formData.set("subject", editSubject);
    formData.set("htmlTemplate", editHtml);

    startTransition(async () => {
      const result = await updateEmailTemplate(formData);
      if (result.success) {
        setSuccess(true);
        setError(null);
        setTimeout(() => {
          setIsEditing(false);
          setSuccess(false);
        }, 1500);
      } else {
        setError(result.error ?? "Ett fel uppstod");
      }
    });
  };

  const handleReset = async (template: EmailTemplateItem) => {
    if (!template.isCustom) return;

    const formData = new FormData();
    formData.set("name", template.name);
    formData.set("locale", template.locale);

    startTransition(async () => {
      await resetEmailTemplate(formData);
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-card-foreground">
          {t("emailTemplates.title")}
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("emailTemplates.description")}
      </p>

      <Accordion type="single" collapsible className="w-full">
        {Object.entries(groupedTemplates).map(([name, localeTemplates]) => (
          <AccordionItem key={name} value={name}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <span className="font-medium">
                  {TEMPLATE_LABELS[name as TemplateName]?.sv ?? name}
                </span>
                {localeTemplates.some((t) => t.isCustom) && (
                  <Badge variant="secondary" className="text-xs">
                    Anpassad
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pt-2">
                {localeTemplates.map((template) => (
                  <div
                    key={`${template.name}-${template.locale}`}
                    className="flex items-center justify-between rounded-md border border-border bg-background p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="uppercase">
                        {template.locale}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium">{template.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {template.isCustom ? "Anpassad mall" : "Standardmall"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(template)}
                        disabled={isPending}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(template)}
                        disabled={isPending}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {template.isCustom && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReset(template)}
                          disabled={isPending}
                          title="Återställ till standard"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* Edit Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              Redigera e-postmall:{" "}
              {selectedTemplate &&
                TEMPLATE_LABELS[selectedTemplate.name]?.sv}{" "}
              ({selectedTemplate?.locale.toUpperCase()})
            </DialogTitle>
            <DialogDescription>
              Anpassa ämnesrad och HTML-innehåll. Använd{" "}
              {"{{variabelnamn}}"} för dynamiska värden.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Ämnesrad</Label>
              <Input
                id="subject"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="Ange ämnesrad..."
              />
            </div>

            {selectedTemplate && (
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Tillgängliga variabler:
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedTemplate.variables.map((v) => (
                    <code
                      key={v}
                      className="rounded bg-background px-1.5 py-0.5 text-xs font-mono"
                    >
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              </div>
            )}

            <Tabs defaultValue="html" className="w-full">
              <TabsList>
                <TabsTrigger value="html" className="gap-2">
                  <Code className="h-4 w-4" />
                  HTML
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-2">
                  <Eye className="h-4 w-4" />
                  Förhandsgranskning
                </TabsTrigger>
              </TabsList>
              <TabsContent value="html">
                <div className="space-y-2">
                  <Label htmlFor="htmlTemplate">HTML-mall</Label>
                  <Textarea
                    id="htmlTemplate"
                    value={editHtml}
                    onChange={(e) => setEditHtml(e.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                    placeholder="HTML-innehåll..."
                  />
                </div>
              </TabsContent>
              <TabsContent value="preview">
                <div className="space-y-3">
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-xs text-muted-foreground mb-1">Ämnesrad:</p>
                    <p className="font-medium">{getPreviewSubject(editSubject)}</p>
                  </div>
                  <div className="rounded-md border border-border bg-white overflow-hidden">
                    <iframe
                      srcDoc={getPreviewHtml(editHtml)}
                      className="w-full h-[500px]"
                      title="E-postförhandsgranskning"
                      sandbox="allow-same-origin"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Variablerna ersätts med exempeldata i förhandsgranskningen.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <X className="h-4 w-4" />
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-md bg-success/10 p-3 text-sm text-success flex items-center gap-2">
                <Check className="h-4 w-4" />
                Mallen har sparats!
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Avbryt
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Sparar..." : "Spara ändringar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] max-h-[90vh] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Förhandsgranskning</DialogTitle>
            {previewSubject && (
              <DialogDescription>
                <strong>Ämne:</strong> {previewSubject}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="rounded-md border border-border bg-white overflow-hidden">
            {previewHtml && (
              <iframe
                srcDoc={previewHtml}
                className="w-full h-[500px]"
                title="E-postförhandsgranskning"
                sandbox="allow-same-origin"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              Stäng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
