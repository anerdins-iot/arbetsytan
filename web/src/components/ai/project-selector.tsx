"use client";

import { useTranslations } from "next-intl";
import { FolderOpen, User } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProjectOption = {
  id: string;
  name: string;
};

type ProjectSelectorProps = {
  projects: ProjectOption[];
  currentProjectId: string | null;
  onSelect: (projectId: string | null) => void;
  disabled?: boolean;
};

const PERSONAL_VALUE = "__personal__";

export function ProjectSelector({
  projects,
  currentProjectId,
  onSelect,
  disabled,
}: ProjectSelectorProps) {
  const t = useTranslations("personalAi.projectSelector");

  return (
    <Select
      value={currentProjectId ?? PERSONAL_VALUE}
      onValueChange={(value) => {
        onSelect(value === PERSONAL_VALUE ? null : value);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        className="h-7 gap-1.5 border-border/50 bg-muted/50 text-xs max-w-[140px]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectItem value={PERSONAL_VALUE}>
          <User className="size-3.5 text-muted-foreground" />
          {t("personal")}
        </SelectItem>
        {projects.length > 0 && <SelectSeparator />}
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            <FolderOpen className="size-3.5 text-muted-foreground" />
            {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
