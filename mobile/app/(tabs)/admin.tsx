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
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { employeePhotoUrl } from "@/lib/mail";
import ThemeIcon from "@/components/ThemeIcon";

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

interface PendingAbsence {
  absence_id: string;
  kind: string;
  employee_id: string;
  full_name: string;
  photo_path: string | null;
  date_from: string;
  date_to: string;
  note: string | null;
}

interface Overview {
  checked_in: OverviewPerson[];
  sick: OverviewPerson[];
  vacation: OverviewPerson[];
  pending_absences: PendingAbsence[];
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
      ...(overview.pending_absences ?? []).map((p) => ({
        employee_id: p.employee_id,
        full_name: p.full_name,
        photo_path: p.photo_path,
      })),
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

  async function reviewAbsence(a: PendingAbsence, decision: "approved" | "rejected") {
    const { error } = await supabase.rpc("absence_review", {
      p_id: a.absence_id,
      p_decision: decision,
    });
    if (error) {
      Alert.alert("Villa", error.message);
      return;
    }
    load();
  }

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
          onPress={() => router.push("/admin-projects")}
        >
          <ThemeIcon name="briefcase-outline" size={42} />
          <Text style={styles.actionText}>Verkefni</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/admin-times")}
        >
          <ThemeIcon name="time-outline" size={42} />
          <Text style={styles.actionText}>Tímaskráningar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/admin-report")}
        >
          <ThemeIcon name="mail-outline" size={42} />
          <Text style={styles.actionText}>Senda skýrslu</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/admin-employees")}
        >
          <ThemeIcon name="people-outline" size={42} />
          <Text style={styles.actionText}>Starfsmenn</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/admin-places")}
        >
          <ThemeIcon name="location-outline" size={42} />
          <Text style={styles.actionText}>Staðir</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/admin-travel-report")}
        >
          <ThemeIcon name="analytics-outline" size={42} />
          <Text style={styles.actionText}>Ferðaskýrsla</Text>
        </TouchableOpacity>
      </View>

      {data && (data.pending_absences ?? []).length > 0 && (
        <>
          <View style={styles.sectionRow}>
            <ThemeIcon name="hourglass-outline" size={28} />
            <Text style={styles.sectionTitle}>
              Bíður samþykktar ({data.pending_absences.length})
            </Text>
          </View>
          <View style={styles.card}>
            {data.pending_absences.map((p, i) => (
              <View
                key={p.absence_id}
                style={[styles.pendingRow, i > 0 && styles.rowBorder]}
              >
                <View style={styles.row}>
                  <Avatar name={p.full_name} url={photos[p.employee_id] ?? null} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name}>{p.full_name}</Text>
                    <Text style={styles.sub}>
                      {p.kind === "vacation" ? "Sumarfrí" : "Veikindi"}:{" "}
                      {p.date_from === p.date_to
                        ? p.date_from
                        : `${p.date_from} – ${p.date_to}`}
                      {p.note ? ` · ${p.note}` : ""}
                    </Text>
                  </View>
                </View>
                <View style={styles.pendingButtons}>
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() => reviewAbsence(p, "approved")}
                  >
                    <Ionicons name="checkmark" size={15} color="#fff" />
                    <Text style={styles.reviewText}>Samþykkja</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => reviewAbsence(p, "rejected")}
                  >
                    <Ionicons name="close" size={15} color="#dc2626" />
                    <Text style={styles.rejectText}>Hafna</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={styles.sectionRow}>
        <ThemeIcon name="person-outline" size={28} />
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
        <ThemeIcon name="medkit-outline" size={28} />
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
        <ThemeIcon name="sunny-outline" size={28} />
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
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 18 },
  actionButton: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    gap: 4,
  },
  pendingRow: { paddingVertical: 8 },
  pendingButtons: { flexDirection: "row", gap: 8, marginTop: 8, marginLeft: 54 },
  approveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#16a34a",
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  reviewText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  rejectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
  },
  rejectText: { color: "#dc2626", fontWeight: "700", fontSize: 13 },
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
