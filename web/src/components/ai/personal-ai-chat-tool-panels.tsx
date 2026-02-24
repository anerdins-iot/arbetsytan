"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { X, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { PersonalAiChatToolPanelContent } from "@/components/ai/personal-ai-chat-tool-panel-content";
import type { PersonalAiChatPanelType, PersonalAiChatPanelData } from "@/components/ai/personal-ai-chat-tool-panel-content";
import type { PersonalAiChatToolPanelContentCallbacks } from "@/components/ai/personal-ai-chat-tool-panel-content";
import type { NoteCategoryItem } from "@/actions/note-categories";
import type { GroupedTimeEntries } from "@/actions/time-entries";

export type ActiveToolPanel = { type: PersonalAiChatPanelType; title: string } | null;

export type PersonalAiChatToolPanelsProps = {
  activeToolPanel: ActiveToolPanel;
  panelData: PersonalAiChatPanelData | null;
  mode: "sheet" | "docked";
  isDesktopToolPanel: boolean;
  noteListCategories: NoteCategoryItem[];
  timeEntryPanelLoading: boolean;
  timeEntryPanelData: {
    groupedEntries: GroupedTimeEntries[];
    tasks: Array<{ id: string; title: string }>;
  } | null;
  onClose: () => void;
  onCollapsePanel?: () => void;
  t: (key: string) => string;
  tQuotes: (key: string) => string;
  tShopping: (key: string) => string;
  callbacks: PersonalAiChatToolPanelContentCallbacks;
};

const PANEL_TYPES: PersonalAiChatPanelType[] = [
  "email",
  "quote",
  "search",
  "report",
  "quoteList",
  "noteList",
  "timeEntry",
  "fileList",
  "taskList",
  "shoppingList",
];

function getSheetTitleDefault(
  type: PersonalAiChatPanelType,
  t: (key: string) => string,
  tQuotes: (key: string) => string,
  tShopping: (key: string) => string
): string {
  switch (type) {
    case "email":
      return t("emailPanel.sheetTitle");
    case "quote":
      return "Offert";
    case "search":
      return "Sökresultat";
    case "report":
      return "Rapport";
    case "quoteList":
      return tQuotes("title");
    case "noteList":
      return t("noteList.title");
    case "timeEntry":
      return t("timeEntryListSheetTitle");
    case "fileList":
      return t("fileListPanel.title");
    case "taskList":
      return t("taskList.sheetTitle");
    case "shoppingList":
      return tShopping("title");
    default:
      return "";
  }
}

export function PersonalAiChatToolPanels({
  activeToolPanel,
  panelData,
  mode,
  isDesktopToolPanel,
  noteListCategories,
  timeEntryPanelLoading,
  timeEntryPanelData,
  onClose,
  onCollapsePanel,
  t,
  tQuotes,
  tShopping,
  callbacks,
}: PersonalAiChatToolPanelsProps) {
  const toolResultSheetSide = isDesktopToolPanel ? "right" : "bottom";
  const toolResultSheetClass = isDesktopToolPanel
    ? "max-w-2xl"
    : "max-h-[85vh] overflow-y-auto";

  // Docked: single column with header + content
  if (mode === "docked" && activeToolPanel) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <h3 className="text-sm font-semibold">{activeToolPanel.title}</h3>
          <div className="flex items-center gap-1">
            {mode === "docked" && onCollapsePanel && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={onCollapsePanel}
                aria-label={t("strip.collapsePanel")}
              >
                <PanelLeftClose className="size-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <PersonalAiChatToolPanelContent
            panelType={activeToolPanel.type}
            panelData={panelData}
            t={t}
            tQuotes={tQuotes}
            tShopping={tShopping}
            noteListCategories={noteListCategories}
            timeEntryPanelLoading={timeEntryPanelLoading}
            timeEntryPanelData={timeEntryPanelData}
            callbacks={callbacks}
          />
        </div>
      </div>
    );
  }

  // Sheet: all Sheet wrappers, content = ToolPanelContent
  return (
    <>
      {PANEL_TYPES.map((type) => {
        const open = activeToolPanel?.type === type;
        const title =
          activeToolPanel?.type === type
            ? activeToolPanel.title
            : getSheetTitleDefault(type, t, tQuotes, tShopping);
        return (
          <Sheet
            key={type}
            open={open}
            onOpenChange={(o) => {
              if (!o) onClose();
            }}
          >
            <SheetContent
              side={toolResultSheetSide}
              className={cn(
                "flex flex-col gap-0 p-0",
                !isDesktopToolPanel && "max-h-[85vh]"
              )}
            >
              <SheetHeader className="border-b border-border px-4 py-3 shrink-0">
                <SheetTitle>{title}</SheetTitle>
              </SheetHeader>
              <div
                className={cn(
                  "flex-1 min-h-0 overflow-y-auto p-4",
                  toolResultSheetClass
                )}
              >
                <PersonalAiChatToolPanelContent
                  panelType={type}
                  panelData={open ? panelData : null}
                  t={t}
                  tQuotes={tQuotes}
                  tShopping={tShopping}
                  noteListCategories={noteListCategories}
                  timeEntryPanelLoading={timeEntryPanelLoading}
                  timeEntryPanelData={timeEntryPanelData}
                  callbacks={callbacks}
                />
              </div>
            </SheetContent>
          </Sheet>
        );
      })}
    </>
  );
}
