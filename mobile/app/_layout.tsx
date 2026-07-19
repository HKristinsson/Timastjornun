import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
// Skráir bakgrunns-geofencing verkið (TaskManager.defineTask) við ræsingu.
import "@/lib/geofence";
// Setur notification-handler (tilkynningar birtast líka með appið opið).
import "@/lib/push";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="project-select" options={{ headerShown: true, title: "Öll verkefni" }} />
        <Stack.Screen name="active" />
        <Stack.Screen name="message/[id]" options={{ headerShown: true, title: "Skeyti" }} />
        <Stack.Screen name="compose" options={{ headerShown: true, title: "Nýtt skeyti" }} />
        <Stack.Screen name="sick" options={{ headerShown: true, title: "Skrá veikindi" }} />
      </Stack>
    </>
  );
}
