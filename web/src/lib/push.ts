export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

export type StoredPushSubscription = {
  endpoint: string;
  p256dhKey: string;
  authKey: string;
};

export function getVapidPublicKey(): string | null {
  return process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null;
}

function getVapidPrivateKey(): string | null {
  return process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? null;
}

function getVapidSubject(): string | null {
  return process.env.WEB_PUSH_VAPID_SUBJECT ?? null;
}

function isConfigured(): boolean {
  return Boolean(getVapidPublicKey() && getVapidPrivateKey() && getVapidSubject());
}

function toWebPushSubscription(input: StoredPushSubscription) {
  return {
    endpoint: input.endpoint,
    keys: {
      p256dh: input.p256dhKey,
      auth: input.authKey,
    },
  };
}

export async function sendPushToSubscriptions(
  subscriptions: StoredPushSubscription[],
  payload: PushPayload
): Promise<{ sentCount: number; invalidEndpoints: string[] }> {
  if (!isConfigured()) {
    console.log("[push] VAPID keys missing. Push skipped.", payload);
    return { sentCount: 0, invalidEndpoints: [] };
  }

  if (subscriptions.length === 0) {
    return { sentCount: 0, invalidEndpoints: [] };
  }

  const webpush = await import("web-push");
  webpush.setVapidDetails(
    getVapidSubject()!,
    getVapidPublicKey()!,
    getVapidPrivateKey()!
  );

  let sentCount = 0;
  const invalidEndpoints: string[] = [];

  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(toWebPushSubscription(subscription), body);
        sentCount += 1;
      } catch (error: unknown) {
        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          typeof (error as { statusCode?: unknown }).statusCode === "number"
            ? (error as { statusCode: number }).statusCode
            : null;

        if (statusCode === 404 || statusCode === 410) {
          invalidEndpoints.push(subscription.endpoint);
          return;
        }

        console.error("[push] Failed to send push notification", error);
      }
    })
  );

  return { sentCount, invalidEndpoints };
}
