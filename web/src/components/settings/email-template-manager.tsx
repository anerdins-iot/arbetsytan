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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Edit, RotateCcw, Eye, Code, Check, X, Sparkles, Loader2 } from "lucide-react";
import {
  updateEmailTemplate,
  resetEmailTemplate,
  previewEmailTemplate,
  aiEditEmailTemplate,
  type EmailTemplateItem,
  type AiEditMessage,
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
  "email-reply-notification": {
    sv: "Nytt mailsvar",
    en: "New Email Reply",
  },
  outgoing: {
    sv: "Utgående mail",
    en: "Outgoing Email",
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

  // AI editing state
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiHistory, setAiHistory] = useState<AiEditMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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
    subject: "Exempelämne",
    content: "<p>Hej! Här är ett exempelmeddelande med <strong>formaterad text</strong>.</p>",
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
    setAiInstruction("");
    setAiHistory([]);
    setAiError(null);
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

  const handleAiEdit = async () => {
    if (!aiInstruction.trim() || aiLoading) return;

    setAiLoading(true);
    setAiError(null);

    try {
      const result = await aiEditEmailTemplate({
        currentSubject: editSubject,
        currentHtmlTemplate: editHtml,
        instruction: aiInstruction,
        history: aiHistory.slice(-4), // last 4 messages for context
      });

      if (result.success && result.subject && result.htmlTemplate && result.comment) {
        const comment = result.comment;
        setEditSubject(result.subject);
        setEditHtml(result.htmlTemplate);
        setAiHistory((prev) => [
          ...prev,
          { role: "user" as const, content: aiInstruction },
          { role: "assistant" as const, content: comment },
        ]);
        setAiInstruction("");
      } else {
        setAiError(result.error ?? t("emailTemplates.aiEdit.error"));
      }
    } catch {
      setAiError(t("emailTemplates.aiEdit.error"));
    } finally {
      setAiLoading(false);
    }
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

            {/* AI Edit Section */}
            <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">{t("emailTemplates.aiEdit.title")}</h3>
              </div>

              <div className="flex gap-2">
                <Input
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  placeholder={t("emailTemplates.aiEdit.placeholder")}
                  disabled={aiLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAiEdit();
                    }
                  }}
                />
                <Button
                  onClick={handleAiEdit}
                  disabled={aiLoading || !aiInstruction.trim()}
                  size="sm"
                  className="shrink-0"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      {t("emailTemplates.aiEdit.applying")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-1" />
                      {t("emailTemplates.aiEdit.apply")}
                    </>
                  )}
                </Button>
              </div>

              {aiError && (
                <p className="text-sm text-destructive">{aiError}</p>
              )}

              {aiHistory.length > 0 && (
                <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("emailTemplates.aiEdit.history")}
                  </p>
                  {aiHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`text-xs px-2 py-1 rounded ${
                        msg.role === "user"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <span className="font-medium">
                        {msg.role === "user" ? "Du: " : "AI: "}
                      </span>
                      {msg.content}
                    </div>
                  ))}
                </div>
              )}
            </div>

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
