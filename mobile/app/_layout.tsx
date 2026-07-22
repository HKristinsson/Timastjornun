import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
// Skráir bakgrunns-geofencing verkið (TaskManager.defineTask) við ræsingu.
import "@/lib/geofence";
// Skráir bakgrunns-staðsetningarvöktun (kort stjórnenda) við ræsingu.
import "@/lib/tracking";
// Setur notification-handler (tilkynningar birtast líka með appið opið).
import "@/lib/push";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, headerBackTitle: "Til baka" }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="active" />
        <Stack.Screen name="admin-map" />
        <Stack.Screen name="admin-project-new" options={{ headerShown: true, title: "Stofna verkefni" }} />
        <Stack.Screen name="admin-employees" options={{ headerShown: true, title: "Starfsmenn" }} />
        <Stack.Screen name="admin-times" options={{ headerShown: true, title: "Tímaskráningar" }} />
        <Stack.Screen name="admin-report" options={{ headerShown: true, title: "Senda tímaskýrslu" }} />
        <Stack.Screen name="message/[id]" options={{ headerShown: true, title: "Skeyti" }} />
        <Stack.Screen name="compose" options={{ headerShown: true, title: "Nýtt skeyti" }} />
        <Stack.Screen name="sick" options={{ headerShown: true, title: "Skrá veikindi eða frí" }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
