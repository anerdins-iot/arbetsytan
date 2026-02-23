"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";

type QuoteStatusBadgeProps = {
  status: string;
};

const statusVariantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  SENT: "outline",
  ACCEPTED: "default",
  REJECTED: "destructive",
  EXPIRED: "secondary",
};

export function QuoteStatusBadge({ status }: QuoteStatusBadgeProps) {
  const t = useTranslations("quotes");
  const variant = statusVariantMap[status] ?? "secondary";
  const label = t(`status.${status}` as Parameters<typeof t>[0]);

  return <Badge variant={variant}>{label}</Badge>;
}
