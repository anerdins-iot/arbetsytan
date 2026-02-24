"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { WholesalerProduct } from "@/lib/wholesaler-search";

type WholesalerPanelData = {
  query: string;
  products: WholesalerProduct[];
  count: number;
};

type WholesalerPanelContextValue = {
  open: boolean;
  data: WholesalerPanelData | null;
  openPanel: (data: WholesalerPanelData) => void;
  closePanel: () => void;
  setOpen: (open: boolean) => void;
};

const WholesalerPanelContext = createContext<WholesalerPanelContextValue | null>(null);

export function useWholesalerPanel() {
  const ctx = useContext(WholesalerPanelContext);
  if (!ctx) {
    throw new Error("useWholesalerPanel must be used within WholesalerPanelProvider");
  }
  return ctx;
}

export function WholesalerPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<WholesalerPanelData | null>(null);

  const openPanel = useCallback((panelData: WholesalerPanelData) => {
    setData(panelData);
    setOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <WholesalerPanelContext.Provider value={{ open, data, openPanel, closePanel, setOpen }}>
      {children}
    </WholesalerPanelContext.Provider>
  );
}
