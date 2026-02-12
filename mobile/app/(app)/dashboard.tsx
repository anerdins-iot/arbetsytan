import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { apiFetch } from "../../lib/api";
import {
  getSocket,
  SOCKET_EVENTS,
  type RealtimeTaskEvent,
  type RealtimeNotification,
} from "../../lib/socket";
import { useAuth } from "../../lib/auth-context";
import { cacheSet, cacheGet } from "../../lib/offline-cache";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  deadline: string | null;
  projectId: string;
  projectName: string;
};

const TASKS_CACHE_KEY = "dashboard_tasks";

const statusColors: Record<string, string> = {
  TODO: "#6b7280",
  IN_PROGRESS: "#2563eb",
  DONE: "#16a34a",
};

const priorityLabels: Record<string, string> = {
  LOW: "L\u00e5g",
  MEDIUM: "Medium",
  HIGH: "H\u00f6g",
  URGENT: "Br\u00e5dskande",
};

export default function DashboardScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const router = useRouter();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const fetchTasks = useCallback(async () => {
    try {
      setError(null);
      setIsOffline(false);
      const res = await apiFetch("/api/mobile/tasks");
      if (!res.ok) throw new Error("Kunde inte h\u00e4mta uppgifter");
      const data = await res.json();
      setTasks(data.tasks);

      // Cache tasks for offline use
      if (tenantId) {
        cacheSet(tenantId, TASKS_CACHE_KEY, data.tasks);
      }
    } catch (err) {
      // Try to load from cache when offline
      if (tenantId) {
        const cached = await cacheGet<Task[]>(tenantId, TASKS_CACHE_KEY);
        if (cached) {
          setTasks(cached);
          setIsOffline(true);
          setError(null);
          return;
        }
      }
      setError(err instanceof Error ? err.message : "N\u00e5got gick fel");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Listen for real-time task and notification updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleTaskChange = (_event: RealtimeTaskEvent) => {
      fetchTasks();
    };

    const handleNotification = (_notification: RealtimeNotification) => {
      fetchTasks();
    };

    socket.on(SOCKET_EVENTS.taskCreated, handleTaskChange);
    socket.on(SOCKET_EVENTS.taskUpdated, handleTaskChange);
    socket.on(SOCKET_EVENTS.taskDeleted, handleTaskChange);
    socket.on(SOCKET_EVENTS.notificationNew, handleNotification);

    return () => {
      socket.off(SOCKET_EVENTS.taskCreated, handleTaskChange);
      socket.off(SOCKET_EVENTS.taskUpdated, handleTaskChange);
      socket.off(SOCKET_EVENTS.taskDeleted, handleTaskChange);
      socket.off(SOCKET_EVENTS.notificationNew, handleNotification);
    };
  }, [fetchTasks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTasks();
  }, [fetchTasks]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["bottom"]}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Offline — visar cachad data</Text>
        </View>
      )}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={fetchTasks}>
            <Text style={styles.retryText}>F\u00f6rs\u00f6k igen</Text>
          </Pressable>
        </View>
      ) : tasks.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Inga uppgifter tilldelade</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/(app)/projects/${item.projectId}`)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.taskTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: statusColors[item.status] ?? "#6b7280" },
                  ]}
                >
                  <Text style={styles.statusText}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.projectName}>{item.projectName}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.priority}>
                  {priorityLabels[item.priority] ?? item.priority}
                </Text>
                {item.deadline && (
                  <Text style={styles.deadline}>
                    {new Date(item.deadline).toLocaleDateString("sv-SE")}
                  </Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  list: {
    padding: 16,
  },
  offlineBanner: {
    backgroundColor: "#fef3c7",
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  offlineText: {
    fontSize: 13,
    color: "#92400e",
    fontWeight: "500",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  projectName: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  priority: {
    fontSize: 12,
    color: "#9ca3af",
  },
  deadline: {
    fontSize: 12,
    color: "#ef4444",
  },
  emptyText: {
    fontSize: 16,
    color: "#9ca3af",
  },
  errorBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: "#ef4444",
    marginBottom: 12,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
  },
});
