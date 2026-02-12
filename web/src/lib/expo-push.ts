/**
 * Expo Push API - sends push notifications to mobile devices via Expo's push service.
 * Uses the Expo push token stored in User.pushToken.
 */

export type ExpoPushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data?: Record<string, string>;
};

type ExpoPushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error: string } };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Send a push notification to an Expo push token.
 * Returns true if the notification was sent successfully.
 */
export async function sendExpoPush(
  pushToken: string,
  payload: ExpoPushPayload
): Promise<boolean> {
  // Expo push tokens start with "ExponentPushToken[" or "ExpoPushToken["
  if (
    !pushToken.startsWith("ExponentPushToken[") &&
    !pushToken.startsWith("ExpoPushToken[")
  ) {
    console.log("[expo-push] Invalid push token format:", pushToken);
    return false;
  }

  const message: ExpoPushMessage = {
    to: pushToken,
    title: payload.title,
    body: payload.body,
    sound: "default",
    data: payload.data,
  };

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      console.log("[expo-push] HTTP error:", res.status);
      return false;
    }

    const result = (await res.json()) as { data: ExpoPushTicket };
    if (result.data.status === "error") {
      console.log("[expo-push] Error:", result.data.message);
      return false;
    }

    return true;
  } catch (err) {
    console.log("[expo-push] Failed to send:", err);
    return false;
  }
}
