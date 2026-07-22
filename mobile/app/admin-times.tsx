// Tímaskráningar félagsins fyrir stjórnendur: nýjustu færslur með stöðusíu.
import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";

interface Entry {
  id: string;
  employee_name: string;
  project_no: string;
  project_name: string;
  task_no: string | null;
  task_name: string | null;
  check_in_at: string;
  check_out_at: string | null;
  worked_hours: number | null;
  status: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  active: { label: "Virk", color: "#16a34a" },
  pending: { label: "Í bið", color: "#d97706" },
  approved: { label: "Samþykkt", color: "#2563eb" },
  rejected: { label: "Hafnað", color: "#dc2626" },
};

type Filter = "all" | "active" | "pending" | "approved";

export default function AdminTimes() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    let q = supabase
      .from("v_time_entries")
      .select(
        "id, employee_name, project_no, project_name, task_no, task_name, check_in_at, check_out_at, worked_hours, status"
      )
      .order("check_in_at", { ascending: false })
      .limit(100);
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setEntries((data as Entry[]) ?? []);
    setLoading(false);
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "Allt" },
    { key: "active", label: "Virkar" },
    { key: "pending", label: "Í bið" },
    { key: "approved", label: "Samþykktar" },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.chips}>
        {chips.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.chip, filter === c.key && styles.chipActive]}
            onPress={() => setFilter(c.key)}
          >
            <Text style={[styles.chipText, filter === c.key && styles.chipTextActive]}>
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        ListEmptyComponent={
          !loading ? <Text style={styles.muted}>Engar skráningar.</Text> : null
        }
        renderItem={({ item }) => {
          const s = STATUS[item.status] ?? { label: item.status, color: "#64748b" };
          return (
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name}>{item.employee_name}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {item.project_no} {item.project_name}
                  {item.task_no ? ` ↳ ${item.task_no} ${item.task_name}` : ""}
                </Text>
                <Text style={styles.date}>
                  {new Date(item.check_in_at).toLocaleDateString("is-IS", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  {new Date(item.check_in_at).toLocaleTimeString("is-IS", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {item.check_out_at
                    ? `–${new Date(item.check_out_at).toLocaleTimeString("is-IS", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : " → virk"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.hours}>
                  {item.worked_hours != null ? `${item.worked_hours} klst` : "—"}
                </Text>
                <Text style={[styles.status, { color: s.color }]}>{s.label}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  chips: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 10 },
  chip: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  chipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  chipTextActive: { color: "#fff" },
  muted: { color: "#94a3b8", textAlign: "center", marginTop: 40 },
  row: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 10,
  },
  name: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  sub: { fontSize: 13, color: "#64748b", marginTop: 1 },
  date: { fontSize: 12, color: "#94a3b8", marginTop: 3 },
  hours: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  status: { fontSize: 12, fontWeight: "600", marginTop: 3 },
});
