"use client";

import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { cancelInvitation } from "@/actions/invitations";
import type { InvitationItem } from "@/actions/invitations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";

type Props = {
  invitations: InvitationItem[];
};

function roleName(
  role: string,
  t: ReturnType<typeof useTranslations<"invitations">>
): string {
  switch (role) {
    case "ADMIN":
      return t("roleAdmin");
    case "PROJECT_MANAGER":
      return t("roleProjectManager");
    case "WORKER":
      return t("roleWorker");
    default:
      return role;
  }
}

function statusBadge(
  status: string,
  expiresAt: Date,
  t: ReturnType<typeof useTranslations<"invitations">>
) {
  const isExpired = status === "PENDING" && new Date(expiresAt) < new Date();

  if (isExpired || status === "EXPIRED") {
    return <Badge variant="secondary">{t("statusExpired")}</Badge>;
  }
  if (status === "ACCEPTED") {
    return (
      <Badge variant="default" className="bg-success text-success-foreground">
        {t("statusAccepted")}
      </Badge>
    );
  }
  return <Badge variant="outline">{t("statusPending")}</Badge>;
}

export function InvitationList({ invitations }: Props) {
  const t = useTranslations("invitations");
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useSocketEvent(SOCKET_EVENTS.invitationCreated, refresh);
  useSocketEvent(SOCKET_EVENTS.invitationUpdated, refresh);
  useSocketEvent(SOCKET_EVENTS.invitationDeleted, refresh);

  function handleCancel(invitationId: string) {
    setCancellingId(invitationId);
    const formData = new FormData();
    formData.set("invitationId", invitationId);

    startTransition(async () => {
      await cancelInvitation(formData);
      setCancellingId(null);
      router.refresh();
    });
  }

  if (invitations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-card-foreground">
          {t("pendingInvitations")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("noPendingInvitations")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-card-foreground">
        {t("pendingInvitations")}
      </h2>

      <div className="mt-4 divide-y divide-border">
        {invitations.map((inv) => {
          const isExpired =
            inv.status === "PENDING" && new Date(inv.expiresAt) < new Date();
          const canCancel = inv.status === "PENDING" && !isExpired;

          return (
            <div
              key={inv.id}
              className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-card-foreground">
                  {inv.email}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {roleName(inv.role, t)}
                  </span>
                  {statusBadge(inv.status, inv.expiresAt, t)}
                  {canCancel && (
                    <span className="text-xs text-muted-foreground">
                      {t("expires")}{" "}
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              {canCancel && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCancel(inv.id)}
                  disabled={isPending && cancellingId === inv.id}
                >
                  {isPending && cancellingId === inv.id
                    ? t("cancellingInvitation")
                    : t("cancelInvitation")}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
