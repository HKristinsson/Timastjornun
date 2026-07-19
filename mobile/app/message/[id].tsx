import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Linking,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  readMessage,
  sendMessage,
  listAttachments,
  attachmentUrl,
  type InboundMessage,
  type MessageAttachment,
} from "@/lib/mail";

interface AttView extends MessageAttachment {
  url: string | null;
}

export default function ReadMessage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [msg, setMsg] = useState<InboundMessage | null>(null);
  const [atts, setAtts] = useState<AttView[]>([]);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    readMessage(id).then(setMsg);
    listAttachments(id).then(async (list) => {
      const withUrls = await Promise.all(
        list.map(async (a) => ({
          ...a,
          url: a.storage_path ? await attachmentUrl(a.storage_path) : null,
        }))
      );
      setAtts(withUrls);
    });
  }, [id]);

  async function sendReply() {
    if (!msg || !reply.trim()) return;
    setBusy(true);
    try {
      await sendMessage(msg.sender_email, `Re: ${msg.subject ?? ""}`, reply.trim());
      Alert.alert("Sent", "Svarið var sent.");
      setReplying(false);
      setReply("");
    } catch (e) {
      Alert.alert("Villa", e instanceof Error ? e.message : "Tókst ekki að senda.");
    } finally {
      setBusy(false);
    }
  }

  if (!msg) {
    return <Text style={styles.muted}>Hleð…</Text>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.subject}>{msg.subject || "(ekkert efni)"}</Text>
        <Text style={styles.meta}>
          Frá: {msg.sender_name || msg.sender_email}
          {"\n"}
          {new Date(msg.received_at).toLocaleString("is-IS")}
        </Text>
        <View style={styles.divider} />
        <Text style={styles.body}>{msg.body_text}</Text>

        {atts.length > 0 && (
          <>
            <View style={styles.divider} />
            <Text style={styles.attHeader}>Viðhengi ({atts.length})</Text>
            {atts.map((a) =>
              a.url && a.content_type?.startsWith("image/") ? (
                <TouchableOpacity key={a.id} onPress={() => Linking.openURL(a.url!)}>
                  <Image source={{ uri: a.url }} style={styles.attImage} resizeMode="cover" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  key={a.id}
                  style={styles.attFile}
                  onPress={() => a.url && Linking.openURL(a.url)}
                >
                  <Text style={styles.attFileName}>📎 {a.filename}</Text>
                </TouchableOpacity>
              )
            )}
          </>
        )}
      </View>

      {replying ? (
        <View style={styles.card}>
          <Text style={styles.replyLabel}>Svar til {msg.sender_email}</Text>
          <TextInput
            autoFocus
            multiline
            numberOfLines={5}
            value={reply}
            onChangeText={setReply}
            placeholder="Skrifaðu svar…"
            style={styles.input}
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              style={[styles.button, { flex: 1 }, (!reply.trim() || busy) && styles.disabled]}
              disabled={!reply.trim() || busy}
              onPress={sendReply}
            >
              <Text style={styles.buttonText}>{busy ? "Sendi…" : "Senda svar"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonGhost} onPress={() => setReplying(false)}>
              <Text style={styles.buttonGhostText}>Hætta</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.button} onPress={() => setReplying(true)}>
          <Text style={styles.buttonText}>↩️ Svara</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={{ marginTop: 12 }} onPress={() => router.back()}>
        <Text style={{ color: "#64748b", textAlign: "center" }}>← Til baka</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  muted: { color: "#94a3b8", textAlign: "center", marginTop: 40 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12 },
  subject: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  meta: { marginTop: 6, fontSize: 13, color: "#64748b", lineHeight: 18 },
  divider: { height: 1, backgroundColor: "#f1f5f9", marginVertical: 12 },
  body: { fontSize: 15, color: "#1e293b", lineHeight: 22 },
  attHeader: { fontWeight: "700", color: "#334155", marginBottom: 8 },
  attImage: { width: "100%", height: 200, borderRadius: 10, marginBottom: 8 },
  attFile: { backgroundColor: "#f8fafc", borderRadius: 10, padding: 12, marginBottom: 6 },
  attFileName: { color: "#2563eb", fontWeight: "600" },
  replyLabel: { fontWeight: "600", color: "#334155", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 15,
  },
  button: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  buttonGhost: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16 },
  buttonGhostText: { color: "#475569", fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
