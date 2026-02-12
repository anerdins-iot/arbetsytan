"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  removePushSubscription,
  type NotificationPreferences,
  updateNotificationPreferences,
  upsertPushSubscription,
} from "@/actions/notification-preferences";

type NotificationSettingsProps = {
  initialPreferences: NotificationPreferences;
};

function base64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function NotificationSettings({ initialPreferences }: NotificationSettingsProps) {
  const t = useTranslations("settings.notifications");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(initialPreferences);

  function persistPreferences(next: NotificationPreferences) {
    setPreferences(next);
    startTransition(async () => {
      const result = await updateNotificationPreferences(next);
      if (!result.success) {
        setError(t("errors.saveFailed"));
      }
    });
  }

  async function enablePush(next: NotificationPreferences) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setError(t("errors.pushUnsupported"));
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setError(t("errors.pushPermissionDenied"));
      return;
    }

    const registration = await navigator.serviceWorker.register("/push-sw.js");
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const response = await fetch("/api/push/vapid-public-key");
      const data = (await response.json()) as { publicKey?: string | null };

      if (!data.publicKey) {
        console.log("[push] VAPID public key missing. Using placeholder flow.");
      } else {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(data.publicKey) as BufferSource,
        });
      }
    }

    if (subscription) {
      const json = subscription.toJSON();
      if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
        await upsertPushSubscription({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
          userAgent: navigator.userAgent,
        });
      }
    }

    persistPreferences(next);
  }

  async function disablePush(next: NotificationPreferences) {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
    }

    persistPreferences(next);
  }

  function handlePushChange(checked: boolean) {
    setError(null);
    const next = { ...preferences, pushEnabled: checked };
    startTransition(async () => {
      try {
        if (checked) {
          await enablePush(next);
        } else {
          await disablePush(next);
        }
      } catch {
        setError(t("errors.pushSetupFailed"));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4 rounded border border-input"
              checked={preferences.pushEnabled}
              onChange={(event) => handlePushChange(event.target.checked)}
              disabled={isPending}
            />
            <span>{t("push.enabled")}</span>
          </Label>
          <p className="text-xs text-muted-foreground">{t("push.description")}</p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">{t("email.title")}</p>

          <Label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border border-input"
              checked={preferences.emailTaskAssigned}
              onChange={(event) =>
                persistPreferences({
                  ...preferences,
                  emailTaskAssigned: event.target.checked,
                })
              }
              disabled={isPending}
            />
            <span>{t("email.taskAssigned")}</span>
          </Label>

          <Label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border border-input"
              checked={preferences.emailDeadlineTomorrow}
              onChange={(event) =>
                persistPreferences({
                  ...preferences,
                  emailDeadlineTomorrow: event.target.checked,
                })
              }
              disabled={isPending}
            />
            <span>{t("email.deadlineTomorrow")}</span>
          </Label>

          <Label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border border-input"
              checked={preferences.emailProjectStatusChanged}
              onChange={(event) =>
                persistPreferences({
                  ...preferences,
                  emailProjectStatusChanged: event.target.checked,
                })
              }
              disabled={isPending}
            />
            <span>{t("email.projectStatusChanged")}</span>
          </Label>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {isPending ? t("saving") : t("savedAuto")}
        </p>
      </CardContent>
    </Card>
  );
}
