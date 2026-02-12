import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "ay_access_token";
const REFRESH_TOKEN_KEY = "ay_refresh_token";

/**
 * Token storage abstraction.
 * Uses expo-secure-store on native (iOS/Android).
 * Falls back to in-memory storage on web (for dev/testing only).
 */

let webTokens: Record<string, string> = {};

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    webTokens[key] = value;
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return webTokens[key] ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    delete webTokens[key];
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export async function saveTokens(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  await setItem(ACCESS_TOKEN_KEY, accessToken);
  await setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_TOKEN_KEY);
}

export async function clearTokens(): Promise<void> {
  await deleteItem(ACCESS_TOKEN_KEY);
  await deleteItem(REFRESH_TOKEN_KEY);
}
