// Verkefnaumsjón (stjórnendur): öll verkefni félagsins — opna/loka aðgangi,
// loka verkefni sem er ekki lengur virkt (og endurvekja), og stofna nýtt.
import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import ThemeIcon from "@/components/ThemeIcon";

interface ProjectRow {
  id: string;
  project_no: string;
  name: string;
  address: string | null;
  status: string;
  open_access: boolean;
}

export default function AdminProjects() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("v_projects")
      .select("id, project_no, name, address, status, open_access")
      .order("project_no");
    setProjects((data as ProjectRow[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function toggleOpen(p: ProjectRow) {
    const { error } = await supabase.rpc("project_set_open", {
      p_id: p.id,
      p_open: !p.open_access,
    });
    if (error) {
      Alert.alert("Villa", error.message);
      return;
    }
    setProjects((arr) =>
      arr.map((x) => (x.id === p.id ? { ...x, open_access: !p.open_access } : x))
    );
  }

  async function setStatus(p: ProjectRow, status: "active" | "inactive") {
    if (status === "inactive") {
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert(
          "Loka verkefni",
          `${p.project_no} ${p.name} hverfur þá úr verkefnalista starfsmanna. Tímaskráningar haldast.`,
          [
            { text: "Hætta við", style: "cancel", onPress: () => resolve(false) },
            { text: "Loka verkefni", style: "destructive", onPress: () => resolve(true) },
          ]
        )
      );
      if (!ok) return;
    }
    const { error } = await supabase.rpc("project_set_status", {
      p_id: p.id,
      p_status: status,
    });
    if (error) {
      Alert.alert("Villa", error.message);
      return;
    }
    load();
  }

  const active = projects.filter((p) => p.status === "active");
  const inactive = projects.filter((p) => p.status !== "active");

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <TouchableOpacity
        style={styles.newButton}
        onPress={() => router.push("/admin-project-new")}
      >
        <ThemeIcon name="add-circle-outline" size={36} />
        <Text style={styles.newButtonText}>Stofna nýtt verkefni</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Virk verkefni ({active.length})</Text>
      {active.length === 0 && !loading ? (
        <View style={styles.card}>
          <Text style={styles.muted}>Engin virk verkefni.</Text>
        </View>
      ) : (
        active.map((p) => (
          <View key={p.id} style={styles.card}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.projName}>
                  {p.project_no} {p.name}
                </Text>
                {p.address && <Text style={styles.addr}>{p.address}</Text>}
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setStatus(p, "inactive")}
              >
                <Text style={styles.closeButtonText}>Loka</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.openRow}>
              <Text style={styles.openLabel}>
                {p.open_access
                  ? "Opið — allir starfsmenn geta skráð sig inn"
                  : "Lokað — aðeins úthlutaðir starfsmenn"}
              </Text>
              <Switch
                value={p.open_access}
                onValueChange={() => toggleOpen(p)}
                trackColor={{ true: "#2563eb", false: "#cbd5e1" }}
              />
            </View>
          </View>
        ))
      )}

      {inactive.length > 0 && (
        <>
          <TouchableOpacity
            style={styles.inactiveToggle}
            onPress={() => setShowInactive((v) => !v)}
          >
            <Text style={styles.inactiveToggleText}>
              {showInactive ? "Fela" : "Sýna"} lokuð verkefni ({inactive.length})
            </Text>
          </TouchableOpacity>
          {showInactive &&
            inactive.map((p) => (
              <View key={p.id} style={[styles.card, { opacity: 0.65 }]}>
                <View style={styles.rowTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.projName}>
                      {p.project_no} {p.name}
                    </Text>
                    {p.address && <Text style={styles.addr}>{p.address}</Text>}
                  </View>
                  <TouchableOpacity
                    style={styles.reopenButton}
                    onPress={() => setStatus(p, "active")}
                  >
                    <Text style={styles.reopenButtonText}>Endurvirkja</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  newButton: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  newButtonText: { fontSize: 16, fontWeight: "700", color: "#2563eb" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#334155", marginBottom: 8 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 10 },
  muted: { color: "#94a3b8" },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  projName: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  addr: { color: "#64748b", marginTop: 2, fontSize: 13 },
  closeButton: {
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 9,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  closeButtonText: { color: "#dc2626", fontWeight: "700", fontSize: 13 },
  reopenButton: {
    backgroundColor: "#16a34a",
    borderRadius: 9,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  reopenButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  openRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 10,
  },
  openLabel: { flex: 1, fontSize: 13, color: "#64748b" },
  inactiveToggle: { alignItems: "center", paddingVertical: 12 },
  inactiveToggleText: { color: "#2563eb", fontWeight: "600", fontSize: 14 },
});
