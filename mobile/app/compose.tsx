import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import {
  sendMessage,
  splitRecipients,
  listCompanyUsers,
  type CompanyUser,
} from "@/lib/mail";

export default function Compose() {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [colleagues, setColleagues] = useState<CompanyUser[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    listCompanyUsers().then(setColleagues).catch(() => {});
  }, []);

  function togglePicked(email: string) {
    setPicked((p) =>
      p.includes(email) ? p.filter((e) => e !== email) : [...p, email]
    );
  }

  async function send() {
    const recipients = Array.from(new Set([...picked, ...splitRecipients(to)]));
    if (recipients.length === 0) {
      Alert.alert("Villa", "Veldu viðtakanda af lista eða sláðu inn netfang.");
      return;
    }
    setBusy(true);
    try {
      for (const r of recipients) {
        await sendMessage(r, subject.trim(), body.trim());
      }
      // Eftir sendingu: beint í innhólfið
      router.replace("/messages");
    } catch (e) {
      Alert.alert("Villa", e instanceof Error ? e.message : "Tókst ekki að senda.");
      setBusy(false);
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

        <TouchableOpacity
          style={[styles.button, !canSend && styles.disabled]}
          disabled={!canSend}
          onPress={send}
        >
          <Text style={styles.buttonText}>{busy ? "Sendi…" : "📤 Senda"}</Text>
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
