"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bell, CheckCheck } from "lucide-react";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/actions/notifications";
import { useRouter } from "@/i18n/routing";
import type { DashboardNotification } from "@/actions/dashboard";

type NotificationListProps = {
  notifications: DashboardNotification[];
};

export function NotificationList({ notifications }: NotificationListProps) {
  const t = useTranslations("dashboard.notifications");
  const sectionT = useTranslations("dashboard.sections");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const hasUnread = notifications.some((n) => !n.read);

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markNotificationRead({ notificationId: id });
      router.refresh();
    });
  }

  if (notifications.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {sectionT("notifications")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {sectionT("notifications")}
        </CardTitle>
        {hasUnread && (
          <CardAction>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={isPending}
            >
              <CheckCheck className="size-4" />
              {t("markAllRead")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {notifications.map((notification) => (
          <button
            key={notification.id}
            type="button"
            onClick={() => {
              if (!notification.read) {
                handleMarkRead(notification.id);
              }
            }}
            disabled={isPending}
            className={`flex min-h-[44px] w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 ${
              !notification.read
                ? "border-primary/20 bg-primary/5"
                : ""
            }`}
          >
            <div
              className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
                !notification.read
                  ? "bg-primary/10"
                  : "bg-muted"
              }`}
            >
              <Bell
                className={`size-4 ${
                  !notification.read
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p
                  className={`text-sm ${
                    !notification.read ? "font-medium" : ""
                  }`}
                >
                  {notification.title}
                </p>
                {!notification.read && (
                  <span className="size-2 shrink-0 rounded-full bg-primary" />
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {notification.body}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(notification.createdAt).toLocaleDateString()}
              </p>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
