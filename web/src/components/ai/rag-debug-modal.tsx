"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export type DebugContext = {
  knowledge: Array<{ text: string; similarity: number }>;
  conversations: Array<{ text: string; similarity: number }>;
  documents: Array<{
    text: string;
    similarity: number;
    metadata?: Record<string, unknown>;
  }>;
  totalResults: number;
  queryText: string;
};

type RagDebugModalProps = {
  open: boolean;
  onClose: () => void;
  context: DebugContext;
};

function SimilarityBadge({ similarity }: { similarity: number }) {
  const pct = Math.round(similarity * 100);
  return (
    <Badge
      variant={pct >= 80 ? "default" : pct >= 60 ? "secondary" : "outline"}
      className="shrink-0 tabular-nums"
    >
      {pct}%
    </Badge>
  );
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

type ResultItem = { text: string; similarity: number; metadata?: Record<string, unknown> };

function ResultSection({
  emoji,
  title,
  badgeLabel,
  items,
}: {
  emoji: string;
  title: string;
  badgeLabel: string;
  items: ResultItem[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span>{emoji}</span>
        <h4 className="text-sm font-semibold">{title}</h4>
        <Badge variant="outline" className="text-xs">
          {badgeLabel}
        </Badge>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-6">Inga resultat</p>
      ) : (
        <div className="space-y-1.5 pl-6">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
            >
              <SimilarityBadge similarity={item.similarity} />
              <span className="text-muted-foreground leading-relaxed">
                {truncate(item.text, 300)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RagDebugModal({ open, onClose, context }: RagDebugModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>RAG Debug — Automatisk kontext</DialogTitle>
          <DialogDescription>
            Visar vad den semantiska sökningen hittade ({context.totalResults}{" "}
            resultat totalt)
          </DialogDescription>
        </DialogHeader>

        {/* Query text */}
        <div className="rounded-md bg-muted px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Sökfråga (senaste 3 meddelanden):
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {context.queryText}
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          <ResultSection
            emoji="🧠"
            title="Kunskapsbas"
            badgeLabel="KB"
            items={context.knowledge}
          />
          <ResultSection
            emoji="💬"
            title="Konversationer"
            badgeLabel="Konv"
            items={context.conversations}
          />
          <ResultSection
            emoji="📄"
            title="Dokument"
            badgeLabel="Dok"
            items={context.documents}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
