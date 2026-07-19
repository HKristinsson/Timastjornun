import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { supabase } from "@/lib/supabase";

interface Entry {
  id: string;
  project_no: string;
  project_name: string;
  check_in_at: string;
  check_out_at: string | null;
  worked_hours: number | null;
  status: string;
}

const STATUS: Record<string, string> = {
  active: "Virk",
  pending: "Í bið",
  approved: "Samþykkt",
  rejected: "Hafnað",
};

export default function Timesheet() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("v_time_entries")
      .select("id, project_no, project_name, check_in_at, check_out_at, worked_hours, status")
      .order("check_in_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setEntries((data as Entry[]) ?? []);
        setLoading(false);
      });
  }, []);

  const total = entries.reduce((s, e) => s + (e.worked_hours ?? 0), 0);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={entries}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={
        <Text style={styles.total}>Samtals: {Math.round(total * 100) / 100} klst</Text>
      }
      ListEmptyComponent={<Text style={styles.muted}>Engar skráningar.</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View>
            <Text style={styles.proj}>
              {item.project_no} {item.project_name}
            </Text>
            <Text style={styles.date}>
              {new Date(item.check_in_at).toLocaleDateString("is-IS")}{" "}
              {new Date(item.check_in_at).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })}
              {item.check_out_at
                ? `–${new Date(item.check_out_at).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.hours}>{item.worked_hours ?? "—"} klst</Text>
            <Text style={styles.status}>{STATUS[item.status] ?? item.status}</Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { backgroundColor: "#f8fafc", padding: 16 },
  total: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  muted: { color: "#94a3b8", textAlign: "center", marginTop: 40 },
  row: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  proj: { fontSize: 15, fontWeight: "600" },
  date: { color: "#64748b", marginTop: 2, fontSize: 13 },
  hours: { fontSize: 15, fontWeight: "600" },
  status: { color: "#64748b", fontSize: 13, marginTop: 2 },
});
