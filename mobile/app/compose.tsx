import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  sendMessage,
  splitRecipients,
  listCompanyUsers,
  uploadAttachmentBase64,
  addOutboundAttachment,
  type CompanyUser,
} from "@/lib/mail";

interface PendingPhoto {
  uri: string;       // forskoðun
  base64: string;    // gögnin sjálf
  filename: string;
}

export default function Compose() {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [colleagues, setColleagues] = useState<CompanyUser[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    listCompanyUsers().then(setColleagues).catch(() => {});
  }, []);

  function togglePicked(email: string) {
    setPicked((p) =>
      p.includes(email) ? p.filter((e) => e !== email) : [...p, email]
    );
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
      }));
    setPhotos((p) => [...p, ...added]);
  }

  async function send() {
    const recipients = Array.from(new Set([...picked, ...splitRecipients(to)]));
    if (recipients.length === 0) {
      Alert.alert("Villa", "Veldu viðtakanda af lista eða sláðu inn netfang.");
      return;
    }
    setBusy(true);
    try {
      // 1) Hlaða myndum upp einu sinni (sömu skrár fyrir alla viðtakendur)
      const uploaded: { path: string; filename: string; size: number }[] = [];
      for (let i = 0; i < photos.length; i++) {
        setProgress(`Hleð upp mynd ${i + 1} af ${photos.length}…`);
        const path = await uploadAttachmentBase64(
          photos[i].base64,
          photos[i].filename,
          "image/jpeg"
        );
        uploaded.push({
          path,
          filename: photos[i].filename,
          size: Math.round(photos[i].base64.length * 0.75),
        });
      }
      // 2) Senda á hvern viðtakanda + tengja viðhengin
      for (let i = 0; i < recipients.length; i++) {
        setProgress(recipients.length > 1 ? `Sendi ${i + 1} af ${recipients.length}…` : "Sendi…");
        const sent = await sendMessage(recipients[i], subject.trim(), body.trim());
        for (const u of uploaded) {
          await addOutboundAttachment(sent.id, u.filename, "image/jpeg", u.path, u.size);
        }
      }
      // Eftir sendingu: beint í innhólfið
      router.replace("/messages");
    } catch (e) {
      Alert.alert("Villa", e instanceof Error ? e.message : "Tókst ekki að senda.");
      setBusy(false);
      setProgress(null);
    }
  }

  const canSend = !busy && (picked.length > 0 || to.trim().length > 0) && body.trim().length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.label}>Til</Text>

        {picked.length > 0 && (
          <View style={styles.chipRow}>
            {picked.map((email) => {
              const c = colleagues.find((x) => x.email === email);
              return (
                <TouchableOpacity
                  key={email}
                  style={styles.chip}
                  onPress={() => togglePicked(email)}
                >
                  <Text style={styles.chipText}>{c?.full_name ?? email} ✕</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {colleagues.length > 0 && (
          <TouchableOpacity
            style={styles.pickerToggle}
            onPress={() => setShowPicker((v) => !v)}
          >
            <Text style={styles.pickerToggleText}>
              {showPicker ? "Fela lista" : "👥 Velja af lista samstarfsmanna"}
            </Text>
          </TouchableOpacity>
        )}

        {showPicker && (
          <View style={styles.pickerList}>
            {colleagues.map((c, i) => {
              const on = picked.includes(c.email);
              return (
                <TouchableOpacity
                  key={c.email}
                  style={[styles.pickerRow, i > 0 && styles.pickerRowBorder]}
                  onPress={() => togglePicked(c.email)}
                >
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerName}>{c.full_name}</Text>
                    <Text style={styles.pickerEmail}>{c.email}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TextInput
          value={to}
          onChangeText={setTo}
          placeholder="…eða skrifaðu netfang"
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <Text style={styles.hint}>
          Veldu samstarfsmenn af listanum og/eða skrifaðu netföng — margir
          viðtakendur aðskildir með kommu.
        </Text>

        <Text style={styles.label}>Efni</Text>
        <TextInput value={subject} onChangeText={setSubject} style={styles.input} />

        <Text style={styles.label}>Skeyti</Text>
        <TextInput
          multiline
          numberOfLines={8}
          value={body}
          onChangeText={setBody}
          style={[styles.input, styles.textarea]}
        />

        <Text style={styles.label}>Myndir</Text>
        {photos.length > 0 && (
          <View style={styles.photoRow}>
            {photos.map((p, i) => (
              <View key={i} style={styles.photoWrap}>
                <Image source={{ uri: p.uri }} style={styles.photo} />
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
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity style={styles.attachButton} onPress={takePhoto}>
            <Text style={styles.attachButtonText}>📷 Taka mynd</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachButton} onPress={pickPhotos}>
            <Text style={styles.attachButtonText}>🖼 Velja mynd</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, !canSend && styles.disabled]}
          disabled={!canSend}
          onPress={send}
        >
          <Text style={styles.buttonText}>{busy ? progress ?? "Sendi…" : "📤 Senda"}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16 },
  label: { fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#f8fafc",
  },
  textarea: { minHeight: 140, textAlignVertical: "top" },
  hint: { fontSize: 12, color: "#94a3b8", marginTop: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  chip: {
    backgroundColor: "#dbeafe",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: { color: "#2563eb", fontWeight: "600", fontSize: 13 },
  pickerToggle: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#f8fafc",
    marginBottom: 8,
  },
  pickerToggleText: { color: "#334155", fontWeight: "600", fontSize: 14 },
  pickerList: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    marginBottom: 8,
    maxHeight: 260,
    overflow: "hidden",
  },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  pickerRowBorder: { borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  checkmark: { color: "#fff", fontWeight: "800", fontSize: 13 },
  pickerName: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  pickerEmail: { fontSize: 12, color: "#94a3b8" },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  photoWrap: { position: "relative" },
  photo: { width: 92, height: 92, borderRadius: 10, backgroundColor: "#f1f5f9" },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(15,23,42,0.7)",
    borderRadius: 11,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  photoRemoveText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  attachButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  attachButtonText: { color: "#334155", fontWeight: "600", fontSize: 14 },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.5 },
});
