import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { myAccess } from "@/lib/mail";

// Botnvalmynd appsins. Skilaboð-flipinn sést aðeins hjá þeim sem hafa
// innhólf (hóps-2 hak eða stjórnandi) — aðrir sjá Heim/Tilkynningar/Tíma.
export default function TabsLayout() {
  const [hasMail, setHasMail] = useState(true);
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    myAccess()
      .then((a) => {
        setHasMail(a.hasMail);
        setIsManager(a.isManager);
      })
      .catch(() => {});
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#94a3b8",
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Heim",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Verkefni",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Skilaboð",
          href: hasMail ? "/messages" : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="announcements"
        options={{
          title: "Tilkynningar",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="timesheet"
        options={{
          title: "Tímar",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Stjórnun",
          href: isManager ? "/admin" : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
