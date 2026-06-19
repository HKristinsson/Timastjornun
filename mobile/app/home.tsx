import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";

interface ActiveEntry {
  id: string;
  project_name: string;
  project_no: string;
  check_in_at: string;
}

export default function Home() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("v_my_active_entry")
      .select("id, project_name, project_no, check_in_at")
      .maybeSingle();
    setActive((data as ActiveEntry) ?? null);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Tímaskráning</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signout}>Útskrá</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>STAÐA NÚNA</Text>
        {loading ? (
          <Text style={styles.muted}>Hleð…</Text>
        ) : active ? (
          <>
            <Text style={styles.statusActive}>🟢 Innskráð(ur)</Text>
            <Text style={styles.project}>
              {active.project_no} {active.project_name}
            </Text>
            <TouchableOpacity
              style={styles.buttonPrimary}
              onPress={() => router.push("/active")}
            >
              <Text style={styles.buttonText}>Opna virka skráningu</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.statusIdle}>⚫ Ekki innskráð(ur)</Text>
            <TouchableOpacity
              style={styles.buttonPrimary}
              onPress={() => router.push("/project-select")}
            >
              <Text style={styles.buttonText}>+ Skrá inn á verkefni</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <TouchableOpacity
        style={styles.linkRow}
        onPress={() => router.push("/timesheet")}
      >
        <Text style={styles.linkText}>📋 Tímayfirlit mitt</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, backgroundColor: "#f8fafc", flexGrow: 1 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "700" },
  signout: { color: "#64748b" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, marginBottom: 16 },
  cardLabel: { fontSize: 12, color: "#94a3b8", fontWeight: "600", marginBottom: 8 },
  statusActive: { fontSize: 18, fontWeight: "600", color: "#16a34a" },
  statusIdle: { fontSize: 18, fontWeight: "600", color: "#475569" },
  project: { fontSize: 16, marginTop: 4, marginBottom: 8 },
  muted: { color: "#94a3b8" },
  buttonPrimary: { backgroundColor: "#2563eb", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  linkRow: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  linkText: { fontSize: 16 },
});
