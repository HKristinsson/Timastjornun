// Stjórnun (aðeins admin/verkstjóri): hverjir eru innskráðir og hvar,
// hverjir eru veikir og hverjir í sumarfríi — með myndum starfsmanna,
// og hnappur á kortaskjá með lifandi staðsetningum.
import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { employeePhotoUrl } from "@/lib/mail";

interface OverviewPerson {
  employee_id: string;
  full_name: string;
  photo_path: string | null;
  project_no?: string;
  project_name?: string;
  task_no?: string | null;
  task_name?: string | null;
  check_in_at?: string;
  date_from?: string;
  date_to?: string;
  note?: string | null;
}

interface Overview {
  checked_in: OverviewPerson[];
  sick: OverviewPerson[];
  vacation: OverviewPerson[];
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function sinceText(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h} klst ${mins % 60} mín` : `${mins} mín`;
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return <Image source={{ uri: url }} style={styles.avatar} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarText}>{initials(name)}</Text>
    </View>
  );
}

export default function AdminOverview() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    const { data: ov, error } = await supabase.rpc("admin_overview");
    setLoading(false);
    if (error) {
      if (error.message.includes("FORBIDDEN")) setDenied(true);
      return;
    }
    const overview = ov as Overview;
    setData(overview);

    // Sækja skoðunarslóðir mynda (einu sinni per starfsmann)
    const everyone = [
      ...overview.checked_in,
      ...overview.sick,
      ...overview.vacation,
    ];
    const urls: Record<string, string | null> = {};
    await Promise.all(
      everyone
        .filter((p) => p.photo_path)
        .map(async (p) => {
          urls[p.employee_id] = await employeePhotoUrl(p.photo_path).catch(
            () => null
          );
        })
    );
    setPhotos((prev) => ({ ...prev, ...urls }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (denied) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Aðeins stjórnendur hafa aðgang.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <TouchableOpacity
        style={styles.mapButton}
        onPress={() => router.push("/admin-map")}
      >
        <Ionicons name="map" size={19} color="#fff" />
        <Text style={styles.mapButtonText}>Sjá starfsmenn á korti</Text>
      </TouchableOpacity>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/admin-project-new")}
        >
          <Ionicons name="add-circle" size={22} color="#16a34a" />
          <Text style={styles.actionText}>Stofna verkefni</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/admin-times")}
        >
          <Ionicons name="time" size={22} color="#2563eb" />
          <Text style={styles.actionText}>Tímaskráningar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/admin-report")}
        >
          <Ionicons name="mail" size={22} color="#7c3aed" />
          <Text style={styles.actionText}>Senda skýrslu</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionRow}>
        <Ionicons name="ellipse" size={11} color="#16a34a" />
        <Text style={styles.sectionTitle}>
          Innskráðir núna ({data?.checked_in.length ?? 0})
        </Text>
      </View>
      <View style={styles.card}>
        {!data || data.checked_in.length === 0 ? (
          <Text style={styles.muted}>Enginn innskráður á verk núna.</Text>
        ) : (
          data.checked_in.map((p, i) => (
            <View key={p.employee_id} style={[styles.row, i > 0 && styles.rowBorder]}>
              <Avatar name={p.full_name} url={photos[p.employee_id] ?? null} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name}>{p.full_name}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {p.project_no} {p.project_name}
                  {p.task_no ? ` ↳ ${p.task_no} ${p.task_name}` : ""}
                </Text>
              </View>
              <Text style={styles.time}>
                {p.check_in_at ? sinceText(p.check_in_at) : ""}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.sectionRow}>
        <Ionicons name="medkit" size={14} color="#d97706" />
        <Text style={styles.sectionTitle}>Veikir í dag ({data?.sick.length ?? 0})</Text>
      </View>
      <View style={styles.card}>
        {!data || data.sick.length === 0 ? (
          <Text style={styles.muted}>Enginn skráður veikur í dag.</Text>
        ) : (
          data.sick.map((p, i) => (
            <View key={p.employee_id} style={[styles.row, i > 0 && styles.rowBorder]}>
              <Avatar name={p.full_name} url={photos[p.employee_id] ?? null} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name}>{p.full_name}</Text>
                <Text style={styles.sub}>
                  {p.date_from === p.date_to
                    ? p.date_from
                    : `${p.date_from} – ${p.date_to}`}
                  {p.note ? ` · ${p.note}` : ""}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.sectionRow}>
        <Ionicons name="sunny" size={14} color="#f59e0b" />
        <Text style={styles.sectionTitle}>
          Í sumarfríi í dag ({data?.vacation.length ?? 0})
        </Text>
      </View>
      <View style={[styles.card, { marginBottom: 30 }]}>
        {!data || data.vacation.length === 0 ? (
          <Text style={styles.muted}>Enginn í fríi í dag.</Text>
        ) : (
          data.vacation.map((p, i) => (
            <View key={p.employee_id} style={[styles.row, i > 0 && styles.rowBorder]}>
              <Avatar name={p.full_name} url={photos[p.employee_id] ?? null} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name}>{p.full_name}</Text>
                <Text style={styles.sub}>
                  {p.date_from === p.date_to
                    ? p.date_from
                    : `${p.date_from} – ${p.date_to}`}
                  {p.note ? ` · ${p.note}` : ""}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  muted: { color: "#94a3b8" },
  mapButton: {
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    marginBottom: 18,
  },
  mapButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  actionButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    gap: 4,
  },
  actionText: { fontSize: 12, fontWeight: "600", color: "#334155", textAlign: "center" },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#e2e8f0" },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  name: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  sub: { fontSize: 13, color: "#64748b", marginTop: 1 },
  time: { fontSize: 12, color: "#16a34a", fontWeight: "600" },
});
