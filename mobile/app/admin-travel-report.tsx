// Ferðaskýrsla (stjórnendur): samantekt per starfsmann yfir tímabil —
// hve oft og lengi á skráðum stöðum, á verkstöðum félagsins, og á
// óskráðum stöðum.
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import ThemeIcon from "@/components/ThemeIcon";

interface PlaceAgg {
  visits: number;
  minutes: number;
}

interface EmployeeReport {
  employee_id: string;
  full_name: string;
  stops_total: number;
  minutes_total: number;
  project_stops: number;
  project_minutes: number;
  unknown_stops: number;
  unknown_minutes: number;
  places: Record<string, PlaceAgg>;
}

const PERIODS = [
  { key: 1, label: "Í dag" },
  { key: 7, label: "7 dagar" },
  { key: 30, label: "30 dagar" },
];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} klst ${m} mín` : `${m} mín`;
}

function pct(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export default function AdminTravelReport() {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<EmployeeReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const to = new Date();
    const from = new Date(Date.now() - (days - 1) * 86400_000);
    const { data, error } = await supabase.rpc("track_report", {
      p_from: isoDate(from),
      p_to: isoDate(to),
    });
    setLoading(false);
    if (error) {
      setRows([]);
      return;
    }
    setRows((data ?? []) as EmployeeReport[]);
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodChip, days === p.key && styles.periodChipActive]}
            onPress={() => setDays(p.key)}
          >
            <Text
              style={[styles.periodText, days === p.key && styles.periodTextActive]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#2563eb" style={{ marginTop: 30 }} />
      ) : rows.length === 0 ? (
        <View style={styles.card}>
          <View style={{ alignItems: "center", gap: 10 }}>
            <ThemeIcon name="analytics-outline" size={40} />
            <Text style={styles.muted}>
              Engin ferðagögn á tímabilinu. Gögn safnast á vinnutíma þegar
              starfsmenn eru með appið.
            </Text>
          </View>
        </View>
      ) : (
        rows.map((r) => (
          <View key={r.employee_id} style={styles.card}>
            <Text style={styles.name}>{r.full_name}</Text>
            <Text style={styles.total}>
              {r.stops_total} stopp · samtals {fmtDuration(r.minutes_total)}
            </Text>

            <View style={styles.statRow}>
              <View style={styles.statIcon}>
                <Ionicons name="construct-outline" size={15} color="#16a34a" />
              </View>
              <Text style={styles.statLabel}>Á verkstöðum félagsins</Text>
              <Text style={styles.statValue}>
                {r.project_stops}× · {fmtDuration(r.project_minutes)} (
                {pct(r.project_minutes, r.minutes_total)})
              </Text>
            </View>

            {Object.entries(r.places).map(([placeName, agg]) => (
              <View key={placeName} style={styles.statRow}>
                <View style={styles.statIcon}>
                  <Ionicons name="location-outline" size={15} color="#f59e0b" />
                </View>
                <Text style={styles.statLabel} numberOfLines={1}>
                  {placeName}
                </Text>
                <Text style={styles.statValue}>
                  {agg.visits}× · {fmtDuration(agg.minutes)}
                </Text>
              </View>
            ))}

            <View style={styles.statRow}>
              <View style={styles.statIcon}>
                <Ionicons name="help-circle-outline" size={15} color="#94a3b8" />
              </View>
              <Text style={styles.statLabel}>Óskráðir staðir</Text>
              <Text style={styles.statValue}>
                {r.unknown_stops}× · {fmtDuration(r.unknown_minutes)} (
                {pct(r.unknown_minutes, r.minutes_total)})
              </Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  periodRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  periodChip: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  periodChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  periodText: { fontWeight: "600", color: "#64748b", fontSize: 13.5 },
  periodTextActive: { color: "#fff" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 10 },
  muted: { color: "#94a3b8", fontSize: 13.5, textAlign: "center", lineHeight: 19 },
  name: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  total: { fontSize: 13, color: "#64748b", marginTop: 2, marginBottom: 10 },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#f8fafc",
  },
  statIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: { flex: 1, fontSize: 13.5, color: "#334155", fontWeight: "500" },
  statValue: { fontSize: 12.5, color: "#0f172a", fontWeight: "700" },
});
