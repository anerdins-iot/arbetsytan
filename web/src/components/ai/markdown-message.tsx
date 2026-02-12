"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "highlight.js/styles/github-dark-dimmed.min.css";
import "react-photo-view/dist/react-photo-view.css";

type MarkdownMessageProps = {
  content: string;
};

// Extrahera alla bild-URLer från markdown-texten
function extractImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  // Matcha markdown-bilder: ![alt](url)
  const regex = /!\[.*?\]\((.*?)\)/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    if (match[1]) urls.push(match[1]);
  }
  return urls;
}

/**
 * Renderar meddelanden med markdown-stöd:
 * headers, listor, kod, fetstil, bilder med lightbox, tabeller m.m.
 */
export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const imageUrls = useMemo(() => extractImageUrls(content), [content]);
  const hasImages = imageUrls.length > 0;

  const markdownContent = (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words text-inherit prose-headings:text-inherit prose-strong:text-inherit prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-pre:bg-[#22272e] prose-pre:text-[#adbac7] prose-pre:rounded-md prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Öppna länkar i ny flik
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          // Bilder som thumbnails med lightbox
          img: ({ src, alt, ...props }) => {
            // src kan vara string | Blob, men vi hanterar bara string-URLs
            if (!src || typeof src !== "string") return null;
            return (
              <PhotoView src={src}>
                <img
                  src={src}
                  alt={alt || ""}
                  className="my-2 max-h-48 cursor-pointer rounded-md object-cover transition-opacity hover:opacity-80"
                  loading="lazy"
                  {...props}
                />
              </PhotoView>
            );
          },
          // Inline-kod med bättre styling
          code: ({ className, children, ...props }) => {
            const isBlock = className?.startsWith("hljs") || className?.includes("language-");
            if (isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  // Wrappa i PhotoProvider om det finns bilder (galleri med tangentbordsnavigering)
  if (hasImages) {
    return <PhotoProvider>{markdownContent}</PhotoProvider>;
  }

  return markdownContent;
}
