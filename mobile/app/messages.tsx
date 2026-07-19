import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  listInbox,
  listSent,
  type InboundMessage,
  type OutboundMessage,
} from "@/lib/mail";

const STATUS: Record<string, string> = {
  sent: "Afhent",
  mock_sent: "Í bið (ytra)",
  queued: "Í bið",
  failed: "Mistókst",
};

function when(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("is-IS", { day: "numeric", month: "short" });
}

export default function Messages() {
  const router = useRouter();
  const [box, setBox] = useState<"inbox" | "sent">("inbox");
  const [inbox, setInbox] = useState<InboundMessage[]>([]);
  const [sent, setSent] = useState<OutboundMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [i, s] = await Promise.all([listInbox(), listSent()]);
    setInbox(i);
    setSent(s);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const unread = inbox.filter((m) => !m.read_at).length;

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, box === "inbox" && styles.tabActive]}
          onPress={() => setBox("inbox")}
        >
          <Text style={[styles.tabText, box === "inbox" && styles.tabTextActive]}>
            Innhólf{unread ? ` (${unread})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, box === "sent" && styles.tabActive]}
          onPress={() => setBox("sent")}
        >
          <Text style={[styles.tabText, box === "sent" && styles.tabTextActive]}>
            Sent
          </Text>
        </TouchableOpacity>
      </View>

      {box === "inbox" ? (
        <FlatList
          data={inbox}
          keyExtractor={(m) => m.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={
            !loading ? <Text style={styles.muted}>Innhólfið er tómt.</Text> : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/message/${item.id}`)}
            >
              {!item.read_at && <View style={styles.dot} />}
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text
                    style={[styles.sender, !item.read_at && styles.bold]}
                    numberOfLines={1}
                  >
                    {item.sender_name || item.sender_email}
                  </Text>
                  <Text style={styles.time}>{when(item.received_at)}</Text>
                </View>
                <Text style={styles.subject} numberOfLines={1}>
                  {item.is_starred ? "★ " : ""}
                  {item.subject || "(ekkert efni)"}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={sent}
          keyExtractor={(m) => m.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={
            !loading ? <Text style={styles.muted}>Engin send skeyti.</Text> : null
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.sender} numberOfLines={1}>
                    Til: {item.to_email}
                  </Text>
                  <Text style={styles.time}>{when(item.created_at)}</Text>
                </View>
                <Text style={styles.subject} numberOfLines={1}>
                  {item.subject || "(ekkert efni)"}
                </Text>
                <Text style={styles.status}>{STATUS[item.status] ?? item.status}</Text>
              </View>
            </View>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push("/compose")}>
        <Text style={styles.fabText}>＋ Nýtt skeyti</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  tabs: { flexDirection: "row", margin: 16, backgroundColor: "#e2e8f0", borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  tabActive: { backgroundColor: "#fff" },
  tabText: { fontWeight: "600", color: "#64748b" },
  tabTextActive: { color: "#0f172a" },
  muted: { color: "#94a3b8", textAlign: "center", marginTop: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#2563eb" },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  sender: { flex: 1, fontSize: 15, color: "#334155" },
  bold: { fontWeight: "700", color: "#0f172a" },
  time: { fontSize: 12, color: "#94a3b8" },
  subject: { marginTop: 2, fontSize: 14, color: "#64748b" },
  status: { marginTop: 4, fontSize: 12, color: "#94a3b8" },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    backgroundColor: "#2563eb",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
