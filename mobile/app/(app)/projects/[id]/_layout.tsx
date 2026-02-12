import { Stack } from "expo-router";

export default function ProjectDetailLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Projekt" }} />
      <Stack.Screen name="ai" options={{ title: "Projekt-AI" }} />
    </Stack>
  );
}
