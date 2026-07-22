import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { registerAbsence, listMyAbsences, type Absence } from "@/lib/mail";
import ThemeIcon from "@/components/ThemeIcon";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmt(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("is-IS", {
    day: "numeric",
    month: "short",
  });
}

export default function Sick() {
  const [kind, setKind] = useState<"sick" | "vacation">("sick");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Absence[]>([]);

  const load = useCallback(async () => {
    setItems(await listMyAbsences());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function register() {
    setBusy(true);
    try {
      await registerAbsence(from, to, note.trim() || null, kind);
      Alert.alert(
        "Skráð",
        kind === "sick"
          ? "Veikindin voru skráð — verkstjóri sér skráninguna."
          : "Sumarfríið var skráð — verkstjóri sér skráninguna."
      );
      setNote("");
      load();
    } catch (e) {
      Alert.alert(
        "Villa",
        e instanceof Error && e.message.includes("BAD_RANGE")
          ? "Lokadagur má ekki vera á undan upphafsdegi."
          : "Tókst ekki að skrá."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <View style={styles.kindTabs}>
          <TouchableOpacity
            style={[styles.kindTab, kind === "sick" && styles.kindTabActive]}
            onPress={() => setKind("sick")}
          >
            <Ionicons
              name="medkit-outline"
              size={15}
              color={kind === "sick" ? "#2563eb" : "#94a3b8"}
            />
            <Text style={[styles.kindText, kind === "sick" && styles.kindTextActive]}>
              Veikindi
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.kindTab, kind === "vacation" && styles.kindTabActive]}
            onPress={() => setKind("vacation")}
          >
            <Ionicons
              name="sunny-outline"
              size={15}
              color={kind === "vacation" ? "#2563eb" : "#94a3b8"}
            />
            <Text style={[styles.kindText, kind === "vacation" && styles.kindTextActive]}>
              Sumarfrí
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Frá (ÁÁÁÁ-MM-DD)</Text>
            <TextInput value={from} onChangeText={setFrom} style={styles.input} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Til</Text>
            <TextInput value={to} onChangeText={setTo} style={styles.input} />
          </View>
        </View>
        <Text style={styles.label}>Athugasemd (valfrjálst)</Text>
        <TextInput
          multiline
          value={note}
          onChangeText={setNote}
          style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
        />
        <TouchableOpacity
          style={[styles.button, busy && { opacity: 0.5 }]}
          disabled={busy}
          onPress={register}
        >
          <Text style={styles.buttonText}>
            {busy ? "Skrái…" : kind === "sick" ? "Skrá veikindi" : "Skrá sumarfrí"}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.section}>Mínar skráningar</Text>
      {items.length === 0 ? (
        <Text style={styles.muted}>Engar veikindaskráningar.</Text>
      ) : (
        items.map((a) => (
          <View key={a.id} style={styles.rowCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              <ThemeIcon
                name={a.type === "vacation" ? "sunny-outline" : "medkit-outline"}
                size={28}
              />
              <Text style={styles.rowTitle}>
                {a.date_from === a.date_to ? fmt(a.date_from) : `${fmt(a.date_from)} – ${fmt(a.date_to)}`}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  a.status === "approved"
                    ? styles.statusApproved
                    : a.status === "rejected"
                    ? styles.statusRejected
                    : styles.statusPending,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    a.status === "approved"
                      ? { color: "#16a34a" }
                      : a.status === "rejected"
                      ? { color: "#dc2626" }
                      : { color: "#d97706" },
                  ]}
                >
                  {a.status === "approved"
                    ? "Samþykkt"
                    : a.status === "rejected"
                    ? "Hafnað"
                    : "Bíður"}
                </Text>
              </View>
            </View>
            {a.note ? <Text style={styles.rowNote}>{a.note}</Text> : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16 },
  kindTabs: { flexDirection: "row", backgroundColor: "#e2e8f0", borderRadius: 12, padding: 4 },
  kindTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  kindTabActive: { backgroundColor: "#fff" },
  kindText: { fontWeight: "600", color: "#64748b" },
  kindTextActive: { color: "#0f172a" },
  label: { fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#f8fafc",
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  section: { fontWeight: "700", color: "#334155", marginTop: 20, marginBottom: 8 },
  muted: { color: "#94a3b8" },
  rowCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8 },
  statusBadge: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, marginLeft: "auto" },
  statusApproved: { backgroundColor: "#f0fdf4" },
  statusRejected: { backgroundColor: "#fef2f2" },
  statusPending: { backgroundColor: "#fffbeb" },
  statusText: { fontSize: 11.5, fontWeight: "700" },
  rowTitle: { fontWeight: "600", color: "#0f172a" },
  rowNote: { marginTop: 2, color: "#64748b", fontSize: 13 },
});
