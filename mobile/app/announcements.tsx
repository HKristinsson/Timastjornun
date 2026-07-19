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
import { listAnnouncements, markAnnouncementRead, type Announcement } from "@/lib/mail";

export default function Announcements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await listAnnouncements());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function markRead(id: string) {
    await markAnnouncementRead(id);
    setItems((arr) =>
      arr.map((a) => (a.id === id ? { ...a, read_at: new Date().toISOString() } : a))
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={{ padding: 16 }}
      data={items}
      keyExtractor={(a) => a.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListEmptyComponent={
        !loading ? (
          <Text style={styles.muted}>Engar tilkynningar frá stjórnendum.</Text>
        ) : null
      }
      renderItem={({ item }) => {
        const isOpen = open === item.id;
        return (
          <View style={[styles.card, !item.read_at && styles.cardUnread]}>
            <TouchableOpacity
              style={styles.header}
              onPress={() => setOpen(isOpen ? null : item.id)}
            >
              {!item.read_at && <View style={styles.dot} />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, !item.read_at && styles.bold]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.sender_name ? `Frá: ${item.sender_name} · ` : ""}
                  {new Date(item.created_at).toLocaleDateString("is-IS")}
                </Text>
              </View>
              <Text style={styles.chev}>{isOpen ? "▴" : "▾"}</Text>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.bodyWrap}>
                <Text style={styles.body}>{item.body}</Text>
                {item.read_at ? (
                  <Text style={styles.readOk}>✓ Þú kvittaðir fyrir lestur</Text>
                ) : (
                  <TouchableOpacity style={styles.button} onPress={() => markRead(item.id)}>
                    <Text style={styles.buttonText}>Ég hef lesið þetta</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#f1f5f9" },
  muted: { color: "#94a3b8", textAlign: "center", marginTop: 40 },
  card: { backgroundColor: "#fff", borderRadius: 14, marginBottom: 8, overflow: "hidden" },
  cardUnread: { borderWidth: 1.5, borderColor: "#93c5fd" },
  header: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#2563eb" },
  title: { fontSize: 15, color: "#334155" },
  bold: { fontWeight: "700", color: "#0f172a" },
  meta: { marginTop: 2, fontSize: 12, color: "#94a3b8" },
  chev: { color: "#94a3b8", fontSize: 16 },
  bodyWrap: { borderTopWidth: 1, borderTopColor: "#f1f5f9", padding: 14 },
  body: { fontSize: 15, color: "#1e293b", lineHeight: 22 },
  readOk: { marginTop: 12, color: "#059669", fontWeight: "600", fontSize: 13 },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 14,
  },
  buttonText: { color: "#fff", fontWeight: "700" },
});
