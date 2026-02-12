import { Stack } from "expo-router";

export default function ProjectsLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: "Projekt", headerShown: true }}
      />
      <Stack.Screen
        name="[id]"
        options={{ title: "Projekt", headerShown: false }}
      />
    </Stack>
  );
}
