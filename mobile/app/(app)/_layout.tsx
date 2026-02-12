import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="dashboard"
        options={{ title: "ArbetsYtan", headerShown: true }}
      />
    </Stack>
  );
}
