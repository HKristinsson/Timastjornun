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
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import PhotoAnnotator from "@/components/PhotoAnnotator";
import {
  readMessage,
  sendMessage,
  deleteMessage,
  listAttachments,
  attachmentUrl,
  uploadAttachmentBase64,
  addOutboundAttachment,
  type InboundMessage,
  type MessageAttachment,
} from "@/lib/mail";

interface PendingPhoto {
  uri: string;
  base64: string;
  filename: string;
  width?: number;
  height?: number;
}

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
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [editIndex, setEditIndex] = useState<number | null>(null);

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

  function confirmDelete() {
    Alert.alert("Eyða skeyti", "Eyða þessu skeyti úr innhólfinu þínu?", [
      { text: "Hætta við", style: "cancel" },
      {
        text: "Eyða",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMessage(id);
            router.replace("/messages");
          } catch (e) {
            Alert.alert("Villa", e instanceof Error ? e.message : "Tókst ekki að eyða.");
          }
        },
      },
    ]);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Myndavél", "Leyfðu aðgang að myndavélinni í Stillingum símans.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
    });
    addAssets(res);
  }

  async function pickPhotos() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Myndasafn", "Leyfðu aðgang að myndasafninu í Stillingum símans.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });
    addAssets(res);
  }

  function addAssets(res: ImagePicker.ImagePickerResult) {
    if (res.canceled) return;
    const added = res.assets
      .filter((a) => a.base64)
      .map((a, i) => ({
        uri: a.uri,
        base64: a.base64!,
        filename: a.fileName ?? `mynd-${Date.now()}-${i}.jpg`,
        width: a.width,
        height: a.height,
      }));
    setPhotos((p) => [...p, ...added]);
  }

  async function sendReply() {
    if (!msg || !reply.trim()) return;
    setBusy(true);
    try {
      const sent = await sendMessage(
        msg.sender_email,
        `Re: ${msg.subject ?? ""}`,
        reply.trim()
      );
      for (const p of photos) {
        const path = await uploadAttachmentBase64(p.base64, p.filename, "image/jpeg");
        await addOutboundAttachment(
          sent.id,
          p.filename,
          "image/jpeg",
          path,
          Math.round(p.base64.length * 0.75)
        );
      }
      // Eftir svar: beint í innhólfið
      router.replace("/messages");
      return;
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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="attach" size={16} color="#2563eb" />
                    <Text style={styles.attFileName}>{a.filename}</Text>
                  </View>
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

          {photos.length > 0 && (
            <View style={styles.photoRow}>
              {photos.map((p, i) => (
                <View key={i} style={styles.photoWrap}>
                  <TouchableOpacity onPress={() => setEditIndex(i)}>
                    <Image source={{ uri: p.uri }} style={styles.photo} />
                    <View style={styles.photoEdit}>
                      <Text style={styles.photoEditText}>✏️</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={() => setPhotos((arr) => arr.filter((_, j) => j !== i))}
                  >
                    <Text style={styles.photoRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {editIndex != null && photos[editIndex] && (
            <PhotoAnnotator
              visible
              uri={photos[editIndex].uri}
              imageWidth={photos[editIndex].width}
              imageHeight={photos[editIndex].height}
              onCancel={() => setEditIndex(null)}
              onSave={(base64, uri) => {
                setPhotos((arr) =>
                  arr.map((p, j) => (j === editIndex ? { ...p, base64, uri } : p))
                );
                setEditIndex(null);
              }}
            />
          )}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TouchableOpacity style={styles.attachButton} onPress={takePhoto}>
              <Ionicons name="camera" size={16} color="#334155" />
              <Text style={styles.attachButtonText}>Taka mynd</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachButton} onPress={pickPhotos}>
              <Ionicons name="images" size={16} color="#334155" />
              <Text style={styles.attachButtonText}>Velja mynd</Text>
            </TouchableOpacity>
          </View>

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
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={[styles.button, styles.buttonRow, { flex: 1 }]}
            onPress={() => setReplying(true)}
          >
            <Ionicons name="arrow-undo" size={17} color="#fff" />
            <Text style={styles.buttonText}>Svara</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.buttonDanger, styles.buttonRow]}
            onPress={confirmDelete}
          >
            <Ionicons name="trash" size={16} color="#dc2626" />
            <Text style={styles.buttonDangerText}>Eyða</Text>
          </TouchableOpacity>
        </View>
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
  buttonRow: { flexDirection: "row", justifyContent: "center", gap: 7 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  photoWrap: { position: "relative" },
  photo: { width: 76, height: 76, borderRadius: 10, backgroundColor: "#f1f5f9" },
  photoRemove: {
    position: "absolute",
    top: 3,
    right: 3,
    backgroundColor: "rgba(15,23,42,0.7)",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  photoRemoveText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  photoEdit: {
    position: "absolute",
    bottom: 3,
    right: 3,
    backgroundColor: "rgba(15,23,42,0.7)",
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  photoEditText: { fontSize: 10 },
  attachButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#f8fafc",
  },
  attachButtonText: { color: "#334155", fontWeight: "600", fontSize: 13 },
  buttonDanger: { borderWidth: 1, borderColor: "#fecaca", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center", backgroundColor: "#fff" },
  buttonDangerText: { color: "#dc2626", fontWeight: "700", fontSize: 15 },
  buttonGhost: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16 },
  buttonGhostText: { color: "#475569", fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
