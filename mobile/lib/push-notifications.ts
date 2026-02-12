import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { apiFetch } from "./api";

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register for push notifications and send token to backend.
 * Returns the Expo push token string, or null if unavailable.
 *
 * Push notifications require a Development Build — they do NOT work in Expo Go
 * on Android since SDK 53.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log("[push] Push notifications require a physical device");
    return null;
  }

  // Check and request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[push] Push notification permission denied");
    return null;
  }

  // Get Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  const pushToken = tokenData.data;

  // Configure Android notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  // Send token to backend
  try {
    await apiFetch("/api/mobile/push/register", {
      method: "POST",
      body: JSON.stringify({ pushToken }),
    });
  } catch (err) {
    console.log("[push] Failed to register push token:", err);
  }

  return pushToken;
}

/**
 * Hook to listen for push notification events.
 * Calls onNotification when a notification is received in foreground.
 * Calls onNotificationResponse when user taps a notification.
 */
export function useNotificationListeners(callbacks?: {
  onNotification?: (notification: Notifications.Notification) => void;
  onNotificationResponse?: (
    response: Notifications.NotificationResponse
  ) => void;
}) {
  const notificationListener = useRef<Notifications.EventSubscription>(undefined);
  const responseListener = useRef<Notifications.EventSubscription>(undefined);

  useEffect(() => {
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        callbacks?.onNotification?.(notification);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        callbacks?.onNotificationResponse?.(response);
      });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [callbacks]);
}
