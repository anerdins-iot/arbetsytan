"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PANEL_WIDTH_STORAGE_KEY,
  MIN_PANEL_WIDTH,
  MAX_PANEL_WIDTH,
  DEFAULT_PANEL_WIDTH,
} from "@/components/ai/personal-ai-chat-constants";

export type PersonalAiChatPanelMode = "sheet" | "docked";

function getInitialPanelWidth(): number {
  if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
  try {
    const stored = localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_PANEL_WIDTH;
  } catch {
    return DEFAULT_PANEL_WIDTH;
  }
}

export function usePersonalAiChatPanelResize(mode: PersonalAiChatPanelMode) {
  const [panelWidth, setPanelWidth] = useState(getInitialPanelWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Persist panel width to localStorage when docked
  useEffect(() => {
    if (mode === "docked") {
      try {
        localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
      } catch {
        // Ignore storage errors
      }
    }
  }, [panelWidth, mode]);

  // Mouse move/up during resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = resizeStartX.current - e.clientX;
      const newWidth = Math.min(
        MAX_PANEL_WIDTH,
        Math.max(MIN_PANEL_WIDTH, resizeStartWidth.current + deltaX)
      );
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = panelWidth;
  }, [panelWidth]);

  return { panelWidth, isResizing, handleResizeStart };
}
