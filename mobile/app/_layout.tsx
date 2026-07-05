import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
// Skráir bakgrunns-geofencing verkið (TaskManager.defineTask) við ræsingu.
import "@/lib/geofence";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="home" />
        <Stack.Screen name="project-select" options={{ headerShown: true, title: "Velja verkefni" }} />
        <Stack.Screen name="active" />
        <Stack.Screen name="timesheet" options={{ headerShown: true, title: "Tímayfirlit" }} />
      </Stack>
    </>
  );
}
