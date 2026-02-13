"use client";

import { useState, useTransition, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Send,
  Users,
  Mail,
  Paperclip,
  Loader2,
  X,
  Check,
  AlertCircle,
  FileText,
  FolderOpen,
  Building2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { sendExternalEmail, sendToTeamMembers, type EmailAttachmentInput, type ProjectWithMembers } from "@/actions/send-email";
import { FilePickerButton, type SelectedFile } from "@/components/files/file-picker";

// ─── Types ─────────────────────────────────────────────

type CompanyMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
};

type EmailComposerProps = {
  projects: ProjectWithMembers[];
  companyMembers: CompanyMember[];
};

// ─── Component ─────────────────────────────────────────

export function EmailComposer({ projects, companyMembers }: EmailComposerProps) {
  const t = useTranslations("email");

  // Section open states
  const [externalOpen, setExternalOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(true);

  // Selection states
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedCompanyMembers, setSelectedCompanyMembers] = useState<Set<string>>(new Set());
  const [selectedProjectMembers, setSelectedProjectMembers] = useState<Set<string>>(new Set());
  const [externalRecipients, setExternalRecipients] = useState("");

  // Email content
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<SelectedFile[]>([]);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Get members for the selected project
  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);

  const projectMembers = selectedProject?.members ?? [];

  // Parse external emails
  const externalEmails = useMemo(() => {
    return externalRecipients
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && e.includes("@"));
  }, [externalRecipients]);

  // Calculate total recipients
  const totalRecipients = selectedCompanyMembers.size + selectedProjectMembers.size + externalEmails.length;

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedProjectMembers(new Set());
  };

  const handleCompanyMemberToggle = (memberId: string) => {
    const newSelected = new Set(selectedCompanyMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedCompanyMembers(newSelected);
  };

  const handleProjectMemberToggle = (memberId: string) => {
    const newSelected = new Set(selectedProjectMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedProjectMembers(newSelected);
  };

  const handleSelectAllCompany = () => {
    if (selectedCompanyMembers.size === companyMembers.length) {
      setSelectedCompanyMembers(new Set());
    } else {
      setSelectedCompanyMembers(new Set(companyMembers.map((m) => m.userId)));
    }
  };

  const handleSelectAllProject = () => {
    if (selectedProjectMembers.size === projectMembers.length) {
      setSelectedProjectMembers(new Set());
    } else {
      setSelectedProjectMembers(new Set(projectMembers.map((m) => m.userId)));
    }
  };

  const removeAttachment = (fileId: string) => {
    setAttachments(attachments.filter((a) => a.fileId !== fileId));
  };

  const handleSend = () => {
    setResult(null);
    startTransition(async () => {
      try {
        // Combine all team members (company + project)
        const allTeamMemberIds = new Set([
          ...selectedCompanyMembers,
          ...selectedProjectMembers,
        ]);

        const attachmentInputs: EmailAttachmentInput[] = attachments.map((a) => ({
          fileId: a.fileId,
          fileName: a.fileName,
          source: a.source,
          projectId: a.projectId,
        }));

        const errors: string[] = [];

        // Send to team members if any selected
        if (allTeamMemberIds.size > 0) {
          const res = await sendToTeamMembers(
            Array.from(allTeamMemberIds),
            subject,
            body,
            attachmentInputs
          );
          if (!res.success) {
            errors.push(res.error ?? t("errors.sendFailed"));
          }
        }

        // Send to external recipients if any
        if (externalEmails.length > 0) {
          const formData = new FormData();
          formData.set("recipients", externalEmails.join(","));
          formData.set("subject", subject);
          formData.set("body", body);

          const res = await sendExternalEmail(formData, attachmentInputs);
          if (!res.success) {
            errors.push(res.error ?? res.fieldErrors?.recipients?.[0] ?? t("errors.sendFailed"));
          }
        }

        if (errors.length > 0) {
          setResult({ success: false, message: errors.join(". ") });
        } else {
          setResult({ success: true, message: t("success") });
          // Reset form
          setSelectedCompanyMembers(new Set());
          setSelectedProjectMembers(new Set());
          setExternalRecipients("");
          setSubject("");
          setBody("");
          setAttachments([]);
        }
      } catch (error) {
        console.error("Send email error:", error);
        setResult({ success: false, message: t("errors.sendFailed") });
      }
    });
  };

  const canSend =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    totalRecipients > 0;

  const renderMemberList = (
    members: CompanyMember[],
    selectedMembers: Set<string>,
    onToggle: (id: string) => void,
    onSelectAll: () => void
  ) => (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {selectedMembers.size} / {members.length} {t("selected")}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelectAll}
        >
          {selectedMembers.size === members.length
            ? t("deselectAll")
            : t("selectAll")}
        </Button>
      </div>
      <Separator />
      <ScrollArea className="h-[180px] pr-4">
        <div className="space-y-1">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center gap-3 rounded-md border border-border p-2 hover:bg-muted/50 cursor-pointer"
              onClick={() => onToggle(member.userId)}
            >
              <Checkbox
                checked={selectedMembers.has(member.userId)}
                onCheckedChange={() => onToggle(member.userId)}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {member.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {member.email}
                </p>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                {member.role}
              </Badge>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: Recipient selection */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("recipients")}
            {totalRecipients > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {totalRecipients}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{t("selectRecipients")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Project Members Section */}
          <Collapsible open={projectOpen} onOpenChange={setProjectOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between px-3 py-2 h-auto"
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <span className="font-medium">{t("projectMembers")}</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedProjectMembers.size > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedProjectMembers.size}
                    </Badge>
                  )}
                  {projectOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <div className="space-y-2 pt-2">
                <Select value={selectedProjectId} onValueChange={handleProjectChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectProject")} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-4 w-4" />
                          {project.name}
                          <span className="text-muted-foreground">
                            ({project.members.length})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedProjectId && projectMembers.length > 0 ? (
                  renderMemberList(
                    projectMembers,
                    selectedProjectMembers,
                    handleProjectMemberToggle,
                    handleSelectAllProject
                  )
                ) : selectedProjectId ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t("noTeamMembers")}</p>
                  </div>
                ) : projects.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t("noProjects")}</p>
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t("selectProjectFirst")}</p>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Company Members Section */}
          <Collapsible open={companyOpen} onOpenChange={setCompanyOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between px-3 py-2 h-auto"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-orange-500" />
                  <span className="font-medium">{t("companyMembers")}</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedCompanyMembers.size > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedCompanyMembers.size}
                    </Badge>
                  )}
                  {companyOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              {companyMembers.length > 0 ? (
                renderMemberList(
                  companyMembers,
                  selectedCompanyMembers,
                  handleCompanyMemberToggle,
                  handleSelectAllCompany
                )
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t("noTeamMembers")}</p>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* External Recipients Section */}
          <Collapsible open={externalOpen} onOpenChange={setExternalOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between px-3 py-2 h-auto"
              >
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">{t("externalRecipients")}</span>
                </div>
                <div className="flex items-center gap-2">
                  {externalEmails.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {externalEmails.length}
                    </Badge>
                  )}
                  {externalOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <div className="space-y-2 pt-2">
                <Textarea
                  placeholder={t("emailAddressesPlaceholder")}
                  value={externalRecipients}
                  onChange={(e) => setExternalRecipients(e.target.value)}
                  className="min-h-[120px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {t("emailAddressesHint")}
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Right: Email content */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {t("compose")}
          </CardTitle>
          <CardDescription>{t("composeDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">{t("subject")}</Label>
            <Input
              id="subject"
              placeholder={t("subjectPlaceholder")}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="body">{t("message")}</Label>
            <Textarea
              id="body"
              placeholder={t("messagePlaceholder")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[200px]"
            />
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("attachments")}</Label>
              <FilePickerButton
                selectedFiles={attachments}
                onFilesChange={setAttachments}
                title={t("selectAttachments")}
                description={t("selectAttachmentsDescription")}
                variant="outline"
                size="sm"
                icon={<Paperclip className="h-4 w-4 mr-2" />}
                label={t("addAttachment")}
                multiple
                maxFiles={10}
              />
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-md">
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

          {/* Result message */}
          {result && (
            <div
              className={`flex items-center gap-2 p-3 rounded-md ${
                result.success
                  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
              }`}
            >
              {result.success ? (
                <Check className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span className="text-sm">{result.message}</span>
            </div>
          )}

          {/* Send button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSend}
              disabled={!canSend || isPending}
              size="lg"
              className="gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("sending")}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  {t("send")} {totalRecipients > 0 && `(${totalRecipients})`}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
