"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatResultButtonProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  buttonLabel: string;
  onOpen: () => void;
}

export function ChatResultButton({
  icon,
  title,
  subtitle,
  buttonLabel,
  onOpen,
}: ChatResultButtonProps) {
  return (
    <div className="flex w-full max-w-[85%] items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <Button
        variant="default"
        size="sm"
        onClick={onOpen}
        className="shrink-0 gap-1.5"
      >
        {buttonLabel}
        <ArrowRight className="size-3.5" />
      </Button>
    </div>
  );
}
