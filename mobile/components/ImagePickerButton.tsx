import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "../lib/api";

type ImagePickerButtonProps = {
  projectId: string;
  onUploadComplete?: (url: string) => void;
};

export function ImagePickerButton({
  projectId,
  onUploadComplete,
}: ImagePickerButtonProps) {
  const [uploading, setUploading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  async function pickImage(source: "camera" | "gallery") {
    setShowOptions(false);

    // Request permission
    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Åtkomst nekad",
          "Appen behöver kameraåtkomst för att ta bilder."
        );
        return;
      }
    } else {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Åtkomst nekad",
          "Appen behöver åtkomst till dina bilder."
        );
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync(
      source === "gallery"
        ? {
            mediaTypes: ["images"],
            quality: 0.8,
            allowsEditing: true,
          }
        : undefined
    );

    if (source === "camera") {
      const cameraResult = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: true,
      });

      if (cameraResult.canceled || !cameraResult.assets[0]) return;
      await uploadImage(cameraResult.assets[0]);
      return;
    }

    if (result.canceled || !result.assets[0]) return;
    await uploadImage(result.assets[0]);
  }

  async function uploadImage(asset: ImagePicker.ImagePickerAsset) {
    setUploading(true);
    try {
      // Build FormData with the image
      const formData = new FormData();
      const uri = asset.uri;
      const fileName = asset.fileName ?? uri.split("/").pop() ?? "photo.jpg";
      const mimeType = asset.mimeType ?? "image/jpeg";

      formData.append("file", {
        uri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob);
      formData.append("projectId", projectId);

      const res = await apiFetch("/api/mobile/upload", {
        method: "POST",
        headers: {
          // Let fetch set Content-Type with boundary for FormData
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error ?? "Uppladdning misslyckades"
        );
      }

      const data = await res.json();
      onUploadComplete?.(data.url);
      Alert.alert("Klart", "Bilden har laddats upp.");
    } catch (err) {
      Alert.alert(
        "Fel",
        err instanceof Error ? err.message : "Uppladdning misslyckades"
      );
    } finally {
      setUploading(false);
    }
  }

  if (uploading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={styles.uploadingText}>Laddar upp...</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        style={styles.button}
        onPress={() => setShowOptions(true)}
      >
        <Ionicons name="camera-outline" size={20} color="#2563eb" />
        <Text style={styles.buttonText}>Ladda upp bild</Text>
      </Pressable>

      <Modal
        visible={showOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOptions(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setShowOptions(false)}
        >
          <View style={styles.optionsContainer}>
            <Text style={styles.optionsTitle}>Ladda upp bild</Text>
            <Pressable
              style={styles.option}
              onPress={() => pickImage("camera")}
            >
              <Ionicons name="camera" size={24} color="#2563eb" />
              <Text style={styles.optionText}>Ta foto</Text>
            </Pressable>
            <Pressable
              style={styles.option}
              onPress={() => pickImage("gallery")}
            >
              <Ionicons name="images" size={24} color="#2563eb" />
              <Text style={styles.optionText}>Välj från galleri</Text>
            </Pressable>
            <Pressable
              style={[styles.option, styles.cancelOption]}
              onPress={() => setShowOptions(false)}
            >
              <Text style={styles.cancelText}>Avbryt</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  uploadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#6b7280",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  buttonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
    color: "#2563eb",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  optionsContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  optionsTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111",
    marginBottom: 16,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  optionText: {
    marginLeft: 12,
    fontSize: 16,
    color: "#111",
  },
  cancelOption: {
    justifyContent: "center",
    borderBottomWidth: 0,
    marginTop: 8,
  },
  cancelText: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
  },
});
