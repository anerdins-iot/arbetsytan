import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "../../../../lib/api";

type Assignee = {
  id: string;
  name: string | null;
  email: string;
};

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  deadline: string | null;
  assignees: Assignee[];
};

type FileItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
};

type ProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  address: string | null;
  createdAt: string;
  updatedAt: string;
};

const statusColors: Record<string, string> = {
  TODO: "#6b7280",
  IN_PROGRESS: "#2563eb",
  DONE: "#16a34a",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const res = await apiFetch(`/api/mobile/projects/${id}`);
      if (!res.ok) throw new Error("Kunde inte h\u00e4mta projekt");
      const data = await res.json();
      setProject(data.project);
      setTasks(data.tasks);
      setFiles(data.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "N\u00e5got gick fel");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProject();
  }, [fetchProject]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <Stack.Screen options={{ title: "Laddar..." }} />
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );
  }

  if (error || !project) {
    return (
      <SafeAreaView style={styles.center}>
        <Stack.Screen options={{ title: "Fel" }} />
        <Text style={styles.errorText}>{error ?? "Projekt hittades inte"}</Text>
        <Pressable style={styles.retryButton} onPress={fetchProject}>
          <Text style={styles.retryText}>F\u00f6rs\u00f6k igen</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  type SectionItem = Task | FileItem;
  const sections: { title: string; data: SectionItem[] }[] = [
    { title: `Uppgifter (${tasks.length})`, data: tasks },
    { title: `Filer (${files.length})`, data: files },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: project.name,
          headerShown: true,
          headerRight: () => (
            <Pressable
              onPress={() => router.push(`/(app)/projects/${id}/ai`)}
              style={styles.aiButton}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={22} color="#2563eb" />
            </Pressable>
          ),
        }}
      />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {project.description && (
              <Text style={styles.description}>{project.description}</Text>
            )}
            {project.address && (
              <Text style={styles.address}>{project.address}</Text>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item, section }) => {
          if (section.title.startsWith("Uppgifter")) {
            const task = item as Task;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {task.title}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: statusColors[task.status] ?? "#6b7280" },
                    ]}
                  >
                    <Text style={styles.statusText}>{task.status}</Text>
                  </View>
                </View>
                {task.assignees.length > 0 && (
                  <Text style={styles.assignees}>
                    {task.assignees.map((a) => a.name ?? a.email).join(", ")}
                  </Text>
                )}
              </View>
            );
          }
          const file = item as FileItem;
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons
                  name="document-outline"
                  size={18}
                  color="#6b7280"
                  style={styles.fileIcon}
                />
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {file.name}
                </Text>
              </View>
              <Text style={styles.fileInfo}>
                {formatFileSize(file.size)} &middot;{" "}
                {new Date(file.createdAt).toLocaleDateString("sv-SE")}
              </Text>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
      />
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
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  header: {
    paddingVertical: 12,
  },
  description: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 4,
  },
  address: {
    fontSize: 13,
    color: "#6b7280",
  },
  sectionHeader: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#374151",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "500",
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
  assignees: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 4,
  },
  fileIcon: {
    marginRight: 8,
  },
  fileInfo: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 4,
  },
  aiButton: {
    paddingHorizontal: 8,
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
