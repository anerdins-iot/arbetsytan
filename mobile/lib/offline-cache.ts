/**
 * Offline cache for task list using AsyncStorage.
 * Caches tasks per tenant to maintain tenant isolation.
 * Shows cached data when offline and syncs when back online.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "ay_cache_";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  tenantId: string;
};

function cacheKey(tenantId: string, key: string): string {
  return `${CACHE_PREFIX}${tenantId}_${key}`;
}

/**
 * Save data to offline cache, scoped by tenant.
 */
export async function cacheSet<T>(
  tenantId: string,
  key: string,
  data: T
): Promise<void> {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    tenantId,
  };

  try {
    await AsyncStorage.setItem(
      cacheKey(tenantId, key),
      JSON.stringify(entry)
    );
  } catch (err) {
    console.log("[cache] Failed to save:", err);
  }
}

/**
 * Get data from offline cache.
 * Returns null if no cache exists, data is expired, or tenant doesn't match.
 */
export async function cacheGet<T>(
  tenantId: string,
  key: string
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(tenantId, key));
    if (!raw) return null;

    const entry = JSON.parse(raw) as CacheEntry<T>;

    // Verify tenant isolation
    if (entry.tenantId !== tenantId) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      await AsyncStorage.removeItem(cacheKey(tenantId, key));
      return null;
    }

    return entry.data;
  } catch (err) {
    console.log("[cache] Failed to read:", err);
    return null;
  }
}

/**
 * Remove a specific cache entry.
 */
export async function cacheRemove(
  tenantId: string,
  key: string
): Promise<void> {
  try {
    await AsyncStorage.removeItem(cacheKey(tenantId, key));
  } catch (err) {
    console.log("[cache] Failed to remove:", err);
  }
}

/**
 * Clear all cache for a tenant.
 */
export async function cacheClearTenant(tenantId: string): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const tenantKeys = allKeys.filter((k) =>
      k.startsWith(`${CACHE_PREFIX}${tenantId}_`)
    );
    if (tenantKeys.length > 0) {
      await AsyncStorage.multiRemove(tenantKeys);
    }
  } catch (err) {
    console.log("[cache] Failed to clear tenant cache:", err);
  }
}
