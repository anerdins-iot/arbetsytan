"use client";

import { MessageCircle, PanelRightClose, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PersonalAiChatHeaderProps {
  title: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose?: () => void;
  mode: "sheet" | "docked";
  /** Aria-label for the close button (PanelRightClose), e.g. from t("strip.collapseChat") */
  closeButtonAriaLabel?: string;
}

export function PersonalAiChatHeader({
  title,
  isFullscreen,
  onToggleFullscreen,
  onClose,
  mode,
  closeButtonAriaLabel,
}: PersonalAiChatHeaderProps) {
  const showClose = mode === "docked" && !isFullscreen && onClose != null;

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-2 font-semibold">
        <MessageCircle className="size-5 text-muted-foreground" />
        {title}
      </div>
      <div className="flex items-center gap-1">
        {showClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label={closeButtonAriaLabel ?? "Close"}
          >
            <PanelRightClose className="size-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "Minimize" : "Maximize"}
        >
          {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
