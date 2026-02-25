"use client";

import { useTranslations } from "next-intl";
import { type LinkedUser } from "@/actions/discord";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type LinkedUsersTableProps = {
  users: LinkedUser[];
};

const roleBadgeColors: Record<string, string> = {
  ADMIN: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  PROJECT_MANAGER:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  WORKER:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export function LinkedUsersTable({ users }: LinkedUsersTableProps) {
  const t = useTranslations("settings.discord.linkedUsers");

  if (users.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-card-foreground">
          {t("title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-card-foreground">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("description", { count: users.length })}
      </p>

      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.discordUser")}</TableHead>
              <TableHead>{t("columns.systemUser")}</TableHead>
              <TableHead>{t("columns.role")}</TableHead>
              <TableHead>{t("columns.email")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.userId}>
                <TableCell className="font-mono text-sm">
                  {user.discordUserId}
                </TableCell>
                <TableCell>{user.userName ?? "-"}</TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={roleBadgeColors[user.role] ?? ""}
                  >
                    {t(`roles.${user.role}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {user.userEmail}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
