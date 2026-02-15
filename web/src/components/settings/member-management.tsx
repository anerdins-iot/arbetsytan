"use client";

import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useSocketEvent } from "@/contexts/socket-context";
import { SOCKET_EVENTS } from "@/lib/socket-events";
import {
  removeMembership,
  updateMembershipRole,
  type TenantMember,
} from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type MemberManagementProps = {
  members: TenantMember[];
  currentUserId: string;
};

function roleLabel(
  role: TenantMember["role"],
  t: ReturnType<typeof useTranslations<"settings.users">>
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

export function MemberManagement({
  members,
  currentUserId,
}: MemberManagementProps) {
  const t = useTranslations("settings.users");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingMembershipId, setPendingMembershipId] = useState<string | null>(
    null
  );

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useSocketEvent(SOCKET_EVENTS.membershipCreated, refresh);

  function handleRoleChange(membershipId: string, role: string) {
    setError(null);
    setPendingMembershipId(membershipId);

    const formData = new FormData();
    formData.set("membershipId", membershipId);
    formData.set("role", role);

    startTransition(async () => {
      const result = await updateMembershipRole(formData);
      setPendingMembershipId(null);

      if (!result.success) {
        if (result.error === "LAST_ADMIN") {
          setError(t("errors.lastAdmin"));
          return;
        }
        setError(t("errors.generic"));
        return;
      }

      router.refresh();
    });
  }

  function handleRemoveMember(membershipId: string) {
    setError(null);
    setPendingMembershipId(membershipId);

    const formData = new FormData();
    formData.set("membershipId", membershipId);

    startTransition(async () => {
      const result = await removeMembership(formData);
      setPendingMembershipId(null);

      if (!result.success) {
        if (result.error === "LAST_ADMIN") {
          setError(t("errors.lastAdmin"));
          return;
        }
        if (result.error === "CANNOT_REMOVE_SELF") {
          setError(t("errors.cannotRemoveSelf"));
          return;
        }
        setError(t("errors.generic"));
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-card-foreground">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>

      {error ? (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mt-4 divide-y divide-border">
        {members.map((member) => {
          const isCurrentUser = member.userId === currentUserId;
          const isRowPending = isPending && pendingMembershipId === member.membershipId;

          return (
            <div
              key={member.membershipId}
              className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-card-foreground">
                  {member.name ?? member.email}
                </p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>

              <div className="flex items-center gap-2">
                {isCurrentUser ? (
                  <Badge variant="secondary">{t("you")}</Badge>
                ) : null}

                <Select
                  value={member.role}
                  onValueChange={(value) => handleRoleChange(member.membershipId, value)}
                  disabled={isRowPending}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">{roleLabel("ADMIN", t)}</SelectItem>
                    <SelectItem value="PROJECT_MANAGER">
                      {roleLabel("PROJECT_MANAGER", t)}
                    </SelectItem>
                    <SelectItem value="WORKER">{roleLabel("WORKER", t)}</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleRemoveMember(member.membershipId)}
                  disabled={isRowPending || isCurrentUser}
                >
                  {isRowPending ? t("removing") : t("remove")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
