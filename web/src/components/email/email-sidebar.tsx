"use client";

import { useTranslations } from "next-intl";
import { Inbox, Send, PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type EmailView = "inbox" | "sent" | "compose";

type EmailSidebarProps = {
  currentView: EmailView;
  onViewChange: (view: EmailView) => void;
  unreadCount: number;
};

export function EmailSidebar({
  currentView,
  onViewChange,
  unreadCount,
}: EmailSidebarProps) {
  const t = useTranslations("email.sidebar");

  return (
    <div className="flex flex-col h-full bg-primary text-primary-foreground">
      <div className="p-4 pb-3">
        <Button
          variant="secondary"
          className="w-full justify-start gap-2 bg-accent text-accent-foreground hover:bg-accent/90 font-medium"
          onClick={() => onViewChange("compose")}
        >
          <PenSquare className="h-4 w-4" />
          {t("compose")}
        </Button>
      </div>

      <Separator className="bg-primary-foreground/15" />

      <nav className="flex-1 p-2 space-y-1">
        <SidebarItem
          icon={Inbox}
          label={t("inbox")}
          active={currentView === "inbox"}
          badge={unreadCount > 0 ? unreadCount : undefined}
          onClick={() => onViewChange("inbox")}
        />
        <SidebarItem
          icon={Send}
          label={t("sent")}
          active={currentView === "sent"}
          onClick={() => onViewChange("sent")}
        />
      </nav>
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary-foreground/20 text-primary-foreground"
          : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && (
        <Badge
          variant="secondary"
          className="bg-accent text-accent-foreground text-xs h-5 min-w-5 flex items-center justify-center px-1.5"
        >
          {badge > 99 ? "99+" : badge}
        </Badge>
      )}
    </button>
  );
}
