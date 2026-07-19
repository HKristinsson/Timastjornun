import { useState } from "react";
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
import { sendMessage, splitRecipients } from "@/lib/mail";

export default function Compose() {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const recipients = splitRecipients(to);
    if (recipients.length === 0) {
      Alert.alert("Villa", "Sláðu inn a.m.k. eitt gilt netfang.");
      return;
    }
    setBusy(true);
    try {
      for (const r of recipients) {
        await sendMessage(r, subject.trim(), body.trim());
      }
      router.back();
    } catch (e) {
      Alert.alert("Villa", e instanceof Error ? e.message : "Tókst ekki að senda.");
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.label}>Til</Text>
        <TextInput
          value={to}
          onChangeText={setTo}
          placeholder="netfang samstarfsmanns"
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <Text style={styles.hint}>
          Skeyti innan kerfis afhendast strax. Margir viðtakendur: aðskildu með kommu.
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
          style={[styles.button, (busy || !to.trim() || !body.trim()) && styles.disabled]}
          disabled={busy || !to.trim() || !body.trim()}
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
