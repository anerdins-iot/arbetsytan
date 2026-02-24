"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type NoteCardMarkdownProps = {
  content: string;
};

/**
 * Lätt markdown-rendering för anteckningskort.
 * Visar en trunkerad version utan bilder/kod-highlighting för prestanda.
 * Klickbar container hanteras av föräldern.
 */
export function NoteCardMarkdown({ content }: NoteCardMarkdownProps) {
  // Trunkera innehållet till ~200 tecken för förhandsgranskning
  const truncatedContent =
    content.length > 200 ? content.substring(0, 200) + "…" : content;

  return (
    <div className="pointer-events-none line-clamp-3 min-h-[2rem] text-xs text-muted-foreground">
      <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-xs prose-headings:font-medium prose-headings:text-muted-foreground prose-p:my-0.5 prose-p:text-muted-foreground prose-strong:text-muted-foreground prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0 prose-li:text-muted-foreground prose-code:text-[10px] prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:hidden prose-img:hidden prose-a:text-muted-foreground prose-a:no-underline">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Gömmer bilder helt i förhandsgranskningen
            img: () => null,
            // Gömmer kod-block i förhandsgranskningen
            pre: () => null,
            // Enklare länkar utan interaktion
            a: ({ children }) => <span>{children}</span>,
          }}
        >
          {truncatedContent}
        </ReactMarkdown>
      </div>
    </div>
  );
}
