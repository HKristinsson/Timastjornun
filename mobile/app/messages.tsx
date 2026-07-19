import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  listInbox,
  listSent,
  deleteMessagesMany,
  deleteSentMany,
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
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [i, s] = await Promise.all([listInbox(), listSent()]);
    setInbox(i);
    setSent(s);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSelecting(false);
      setSelected([]);
      load();
    }, [load])
  );

  const unread = inbox.filter((m) => !m.read_at).length;

  function switchBox(b: "inbox" | "sent") {
    setBox(b);
    setSelecting(false);
    setSelected([]);
  }

  function toggleSelected(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function startSelect(id?: string) {
    setSelecting(true);
    if (id) setSelected([id]);
  }

  function deleteSelected() {
    if (selected.length === 0) return;
    Alert.alert(
      "Eyða skeytum",
      `Eyða ${selected.length} skeyti${selected.length === 1 ? "" : "um"} úr ${
        box === "inbox" ? "innhólfinu" : "úthólfinu"
      } þínu?`,
      [
        { text: "Hætta við", style: "cancel" },
        {
          text: "Eyða",
          style: "destructive",
          onPress: async () => {
            try {
              if (box === "inbox") await deleteMessagesMany(selected);
              else await deleteSentMany(selected);
              setSelecting(false);
              setSelected([]);
              load();
            } catch (e) {
              Alert.alert("Villa", e instanceof Error ? e.message : "Tókst ekki að eyða.");
            }
          },
        },
      ]
    );
  }

  function Checkbox({ on }: { on: boolean }) {
    return (
      <View style={[styles.checkbox, on && styles.checkboxOn]}>
        {on && <Text style={styles.checkmark}>✓</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, box === "inbox" && styles.tabActive]}
          onPress={() => switchBox("inbox")}
        >
          <Text style={[styles.tabText, box === "inbox" && styles.tabTextActive]}>
            Innhólf{unread ? ` (${unread})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, box === "sent" && styles.tabActive]}
          onPress={() => switchBox("sent")}
        >
          <Text style={[styles.tabText, box === "sent" && styles.tabTextActive]}>
            Sent
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.selectRow}>
        <Text style={styles.selectHint}>
          {selecting
            ? `${selected.length} valin`
            : "Haltu inni skeyti (eða ýttu á Velja) til að eyða mörgum"}
        </Text>
        <TouchableOpacity
          onPress={() => {
            if (selecting) {
              setSelecting(false);
              setSelected([]);
            } else {
              startSelect();
            }
          }}
        >
          <Text style={styles.selectToggle}>{selecting ? "Hætta við" : "Velja"}</Text>
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
              onPress={() =>
                selecting ? toggleSelected(item.id) : router.push(`/message/${item.id}`)
              }
              onLongPress={() => !selecting && startSelect(item.id)}
            >
              {selecting && <Checkbox on={selected.includes(item.id)} />}
              {!item.read_at && !selecting && <View style={styles.dot} />}
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
            <TouchableOpacity
              style={styles.row}
              onPress={() => selecting && toggleSelected(item.id)}
              onLongPress={() => !selecting && startSelect(item.id)}
              disabled={!selecting && false}
            >
              {selecting && <Checkbox on={selected.includes(item.id)} />}
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
            </TouchableOpacity>
          )}
        />
      )}

      {selecting ? (
        <TouchableOpacity
          style={[styles.deleteBar, selected.length === 0 && styles.disabled]}
          disabled={selected.length === 0}
          onPress={deleteSelected}
        >
          <Text style={styles.deleteBarText}>
            🗑 Eyða völdum ({selected.length})
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.fab} onPress={() => router.push("/compose")}>
          <Text style={styles.fabText}>＋ Nýtt skeyti</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  tabs: { flexDirection: "row", margin: 16, marginBottom: 8, backgroundColor: "#e2e8f0", borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  tabActive: { backgroundColor: "#fff" },
  tabText: { fontWeight: "600", color: "#64748b" },
  tabTextActive: { color: "#0f172a" },
  selectRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  selectHint: { fontSize: 12, color: "#94a3b8", flex: 1 },
  selectToggle: { color: "#2563eb", fontWeight: "700", fontSize: 14, marginLeft: 8 },
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
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxOn: { backgroundColor: "#dc2626", borderColor: "#dc2626" },
  checkmark: { color: "#fff", fontWeight: "800", fontSize: 13 },
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
  deleteBar: {
    position: "absolute",
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: "#dc2626",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  deleteBarText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.5 },
});
