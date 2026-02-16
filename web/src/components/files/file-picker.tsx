"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  FolderOpen,
  User,
  FileText,
  Image as ImageIcon,
  File,
  Loader2,
  Search,
  X,
  ChevronLeft,
  Folder,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────

export type FileItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  projectId?: string;
  projectName?: string;
  url?: string;
  createdAt?: string;
};

export type ProjectItem = {
  id: string;
  name: string;
};

export type SelectedFile = {
  fileId: string;
  fileName: string;
  source: "personal" | "project";
  projectId?: string;
};

export type FilePickerTab = "personal" | "project";

export type FilePickerProps = {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Currently selected files */
  selectedFiles: SelectedFile[];
  /** Callback when selection changes */
  onFilesChange: (files: SelectedFile[]) => void;
  /** Dialog title */
  title?: string;
  /** Dialog description */
  description?: string;
  /** Which tabs to show */
  tabs?: FilePickerTab[];
  /** Allow multiple file selection */
  multiple?: boolean;
  /** File type filter (e.g., "image/*", "application/pdf") */
  accept?: string[];
  /** Max number of files that can be selected */
  maxFiles?: number;
};

// ─── Helpers ───────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) {
    return <ImageIcon className="h-4 w-4 text-blue-500" />;
  }
  if (type.includes("pdf")) {
    return <FileText className="h-4 w-4 text-red-500" />;
  }
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function matchesFilter(fileType: string, accept?: string[]): boolean {
  if (!accept || accept.length === 0) return true;

  return accept.some((filter) => {
    if (filter.endsWith("/*")) {
      // Wildcard like "image/*"
      const category = filter.replace("/*", "");
      return fileType.startsWith(category);
    }
    return fileType === filter;
  });
}

// ─── Component ─────────────────────────────────────────

export function FilePicker({
  open,
  onOpenChange,
  selectedFiles,
  onFilesChange,
  title = "Välj filer",
  description = "Välj filer från din personliga lagring eller projektmappar",
  tabs = ["personal", "project"],
  multiple = true,
  accept,
  maxFiles,
}: FilePickerProps) {
  const [personalFiles, setPersonalFiles] = useState<FileItem[]>([]);
  const [projectFiles, setProjectFiles] = useState<FileItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<FilePickerTab>(tabs[0] ?? "personal");
  const [searchQuery, setSearchQuery] = useState("");

  // For project navigation - null means showing project list
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Track selected file IDs for checkboxes
  const selectedIds = new Set(selectedFiles.map((f) => f.fileId));

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const requests: Promise<void>[] = [];

      if (tabs.includes("personal")) {
        requests.push(
          fetch("/api/files/personal")
            .then((res) => (res.ok ? res.json() : { files: [] }))
            .then((data) => setPersonalFiles(data.files ?? []))
        );
      }

      if (tabs.includes("project")) {
        requests.push(
          fetch("/api/files/projects")
            .then((res) => (res.ok ? res.json() : { files: [], projects: [] }))
            .then((data) => {
              setProjectFiles(data.files ?? []);
              setProjects(data.projects ?? []);
            })
        );
      }

      await Promise.all(requests);
    } catch (error) {
      console.error("Failed to load files:", error);
    } finally {
      setLoading(false);
    }
  }, [tabs]);

  useEffect(() => {
    if (open) {
      loadFiles();
      setSearchQuery("");
      setSelectedProjectId(null);
    }
  }, [open, loadFiles]);

  const toggleFile = (file: FileItem, source: FilePickerTab) => {
    const selected: SelectedFile = {
      fileId: file.id,
      fileName: file.name,
      source,
      projectId: file.projectId,
    };

    if (selectedIds.has(file.id)) {
      // Remove file
      onFilesChange(selectedFiles.filter((f) => f.fileId !== file.id));
    } else {
      if (!multiple) {
        // Single selection mode - replace
        onFilesChange([selected]);
      } else if (maxFiles && selectedFiles.length >= maxFiles) {
        // Max files reached - don't add
        return;
      } else {
        // Add file
        onFilesChange([...selectedFiles, selected]);
      }
    }
  };

  const filterFiles = (files: FileItem[]): FileItem[] => {
    let filtered = files;

    // Apply type filter
    if (accept && accept.length > 0) {
      filtered = filtered.filter((f) => matchesFilter(f.type, accept));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (f) =>
          f.name.toLowerCase().includes(query) ||
          f.projectName?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  // Get files for the currently selected project
  const getProjectFilesForDisplay = (): FileItem[] => {
    if (!selectedProjectId) return [];
    return projectFiles.filter((f) => f.projectId === selectedProjectId);
  };

  // Get project file count for display
  const getProjectFileCount = (projectId: string): number => {
    return projectFiles.filter((f) => f.projectId === projectId).length;
  };

  const renderFileList = (files: FileItem[], source: FilePickerTab) => {
    const filtered = filterFiles(files);

    if (filtered.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <FolderOpen className="h-10 w-10 opacity-50 mb-2" />
          <p className="text-sm">
            {files.length === 0
              ? source === "personal"
                ? "Inga personliga filer hittades"
                : "Inga filer i detta projekt"
              : "Inga filer matchar sökningen"}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {filtered.map((file) => {
          const isSelected = selectedIds.has(file.id);
          const isDisabled =
            !isSelected && maxFiles !== undefined && selectedFiles.length >= maxFiles;

          return (
            <div
              key={file.id}
              className={`flex items-center gap-3 rounded-md border border-border p-2 hover:bg-muted/50 cursor-pointer ${
                isDisabled ? "opacity-50 cursor-not-allowed" : ""
              } ${isSelected ? "bg-primary/5 border-primary/30" : ""}`}
              onClick={() => !isDisabled && toggleFile(file, source)}
            >
              <Checkbox
                checked={isSelected}
                disabled={isDisabled}
                onCheckedChange={() => !isDisabled && toggleFile(file, source)}
              />
              {getFileIcon(file.type)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatFileSize(file.size)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderProjectList = () => {
    const filtered = searchQuery.trim()
      ? projects.filter((p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : projects;

    if (filtered.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <FolderOpen className="h-10 w-10 opacity-50 mb-2" />
          <p className="text-sm">
            {projects.length === 0
              ? "Du är inte med i några projekt"
              : "Inga projekt matchar sökningen"}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {filtered.map((project) => {
          const fileCount = getProjectFileCount(project.id);
          return (
            <div
              key={project.id}
              className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/50 cursor-pointer"
              onClick={() => setSelectedProjectId(project.id)}
            >
              <Folder className="h-5 w-5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{project.name}</p>
                <p className="text-xs text-muted-foreground">
                  {fileCount} {fileCount === 1 ? "fil" : "filer"}
                </p>
              </div>
              <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180" />
            </div>
          );
        })}
      </div>
    );
  };

  const removeFile = (fileId: string) => {
    onFilesChange(selectedFiles.filter((f) => f.fileId !== fileId));
  };

  const selectedProjectName = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)?.name
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök filer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : tabs.length === 1 ? (
          // Single tab - no tab UI needed
          <ScrollArea className="h-[300px] pr-4">
            {tabs[0] === "personal" ? (
              renderFileList(personalFiles, "personal")
            ) : selectedProjectId ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-2 gap-2"
                  onClick={() => setSelectedProjectId(null)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Tillbaka till projekt
                </Button>
                <p className="text-sm font-medium mb-2">{selectedProjectName}</p>
                {renderFileList(getProjectFilesForDisplay(), "project")}
              </>
            ) : (
              renderProjectList()
            )}
          </ScrollArea>
        ) : (
          // Multiple tabs
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v as FilePickerTab);
              setSelectedProjectId(null);
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              {tabs.includes("personal") && (
                <TabsTrigger value="personal" className="gap-2">
                  <User className="h-4 w-4" />
                  Personliga ({filterFiles(personalFiles).length})
                </TabsTrigger>
              )}
              {tabs.includes("project") && (
                <TabsTrigger value="project" className="gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Projekt ({projects.length})
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="personal" className="mt-4">
              <ScrollArea className="h-[300px] pr-4">
                {renderFileList(personalFiles, "personal")}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="project" className="mt-4">
              <ScrollArea className="h-[300px] pr-4">
                {selectedProjectId ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mb-2 gap-2"
                      onClick={() => setSelectedProjectId(null)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Tillbaka till projekt
                    </Button>
                    <p className="text-sm font-medium mb-2 text-muted-foreground">
                      {selectedProjectName}
                    </p>
                    {renderFileList(getProjectFilesForDisplay(), "project")}
                  </>
                ) : (
                  renderProjectList()
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}

        {/* Selected files */}
        {selectedFiles.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Valda filer ({selectedFiles.length}
              {maxFiles ? `/${maxFiles}` : ""})
            </p>
            <div className="flex flex-wrap gap-1">
              {selectedFiles.map((file) => (
                <Badge
                  key={file.fileId}
                  variant="secondary"
                  className="gap-1 pr-1"
                >
                  <FileText className="h-3 w-3" />
                  {file.fileName}
                  <button
                    type="button"
                    onClick={() => removeFile(file.fileId)}
                    className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Klar ({selectedFiles.length} valda)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Trigger Button ────────────────────────────────────

export type FilePickerButtonProps = Omit<
  FilePickerProps,
  "open" | "onOpenChange"
> & {
  /** Button variant */
  variant?: "default" | "outline" | "ghost" | "secondary";
  /** Button size */
  size?: "default" | "sm" | "lg" | "icon";
  /** Custom button label */
  label?: string;
  /** Icon to show in button */
  icon?: React.ReactNode;
  /** Additional class names */
  className?: string;
};

export function FilePickerButton({
  selectedFiles,
  onFilesChange,
  variant = "outline",
  size = "sm",
  label,
  icon,
  className,
  ...pickerProps
}: FilePickerButtonProps) {
  const [open, setOpen] = useState(false);

  const defaultLabel = selectedFiles.length > 0
    ? `${selectedFiles.length} filer valda`
    : "Välj filer";

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        {icon}
        {label ?? defaultLabel}
      </Button>

      <FilePicker
        open={open}
        onOpenChange={setOpen}
        selectedFiles={selectedFiles}
        onFilesChange={onFilesChange}
        {...pickerProps}
      />
    </>
  );
}
