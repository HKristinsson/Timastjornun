import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

// MVP: netfang + lykilorð til prófunar.
// Framtíð (skv. hönnun): OTP á síma við nýskráningu + PIN daglega.
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Innskráning mistókst. Athugaðu netfang og lykilorð.");
      return;
    }
    router.replace("/home");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Tímastjórnun</Text>
      <Text style={styles.subtitle}>Innskráning starfsmanns</Text>

      <TextInput
        style={styles.input}
        placeholder="Netfang"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Lykilorð"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.button} onPress={signIn} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Innskrá</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#f8fafc" },
  logo: { fontSize: 28, fontWeight: "700", color: "#2563eb", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#64748b", textAlign: "center", marginBottom: 28 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  error: { color: "#dc2626", marginBottom: 12, textAlign: "center" },
});
