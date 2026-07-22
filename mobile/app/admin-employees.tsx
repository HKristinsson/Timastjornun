// Starfsmenn — stjórnendur: listi með admin-rofa á hverjum starfsmanni
// og form til að stofna nýjan starfsmann (með valkvæðum admin-réttindum).
import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Image,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { employeePhotoUrl } from "@/lib/mail";
import ThemeIcon from "@/components/ThemeIcon";

interface EmployeeRow {
  employee_id: string;
  full_name: string;
  email: string | null;
  photo_path: string | null;
  status: string;
  has_login: boolean;
  is_admin: boolean;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function translateError(msg: string): string {
  if (msg.includes("EMAIL_EXISTS")) return "Netfangið er þegar í notkun.";
  if (msg.includes("DOMAIN_MISMATCH"))
    return "Netfangið verður að vera á léni félagsins.";
  if (msg.includes("SEAT_LIMIT"))
    return "Sætafjöldi félagsins er fullnýttur — hafðu samband við Tímaverk.";
  if (msg.includes("NO_LOGIN"))
    return "Starfsmaðurinn þarf innskráningu (netfang + lykilorð) fyrst.";
  if (msg.includes("SELF_DEMOTE"))
    return "Þú getur ekki tekið admin-réttindi af sjálfum þér.";
  return msg;
}

export default function AdminEmployees() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Nýr starfsmaður
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("employee_list_admin");
    setLoading(false);
    if (error) return;
    const list = (data ?? []) as EmployeeRow[];
    setEmployees(list);
    const urls: Record<string, string | null> = {};
    await Promise.all(
      list
        .filter((e) => e.photo_path)
        .map(async (e) => {
          urls[e.employee_id] = await employeePhotoUrl(e.photo_path).catch(() => null);
        })
    );
    setPhotos((p) => ({ ...p, ...urls }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function toggleAdmin(e: EmployeeRow) {
    const next = !e.is_admin;
    if (next) {
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert(
          "Gera að stjórnanda",
          `${e.full_name} fær full stjórnandaréttindi: starfsmenn, verkefni, tíma, kort og samþykktir.`,
          [
            { text: "Hætta við", style: "cancel", onPress: () => resolve(false) },
            { text: "Gera að stjórnanda", onPress: () => resolve(true) },
          ]
        )
      );
      if (!ok) return;
    }
    const { error } = await supabase.rpc("employee_set_admin", {
      p_employee_id: e.employee_id,
      p_admin: next,
    });
    if (error) {
      Alert.alert("Villa", translateError(error.message));
      return;
    }
    setEmployees((arr) =>
      arr.map((x) =>
        x.employee_id === e.employee_id ? { ...x, is_admin: next } : x
      )
    );
  }

  async function create() {
    setBusy(true);
    try {
      const { data: emp, error } = await supabase.rpc("create_employee_with_login", {
        p_full_name: fullName.trim(),
        p_employee_no: null,
        p_phone: phone.trim() || null,
        p_email: email.trim().toLowerCase(),
        p_national_id: null,
        p_password: password,
      });
      if (error) throw new Error(error.message);
      if (makeAdmin && emp) {
        const { error: admErr } = await supabase.rpc("employee_set_admin", {
          p_employee_id: (emp as { id: string }).id,
          p_admin: true,
        });
        if (admErr) {
          Alert.alert(
            "Athugið",
            "Starfsmaðurinn var stofnaður en admin-réttindin mistókust: " +
              translateError(admErr.message)
          );
        }
      }
      Alert.alert(
        "Stofnað",
        `${fullName.trim()} getur nú skráð sig inn með ${email.trim().toLowerCase()}.`
      );
      setFullName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setMakeAdmin(false);
      setShowCreate(false);
      load();
    } catch (e) {
      Alert.alert("Villa", translateError(e instanceof Error ? e.message : "Tókst ekki."));
    } finally {
      setBusy(false);
    }
  }

  const canCreate =
    !busy &&
    fullName.trim().length > 1 &&
    email.includes("@") &&
    password.length >= 8;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {showCreate ? (
        <View style={styles.card}>
          <View style={styles.createHeader}>
            <ThemeIcon name="person-add-outline" size={36} />
            <Text style={styles.createTitle}>Nýr starfsmaður</Text>
          </View>

          <Text style={styles.label}>Fullt nafn</Text>
          <TextInput value={fullName} onChangeText={setFullName} style={styles.input} />

          <Text style={styles.label}>Netfang (verður innskráning)</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="nafn@lén-félagsins.is"
            style={styles.input}
          />

          <Text style={styles.label}>Símanúmer (valfrjálst)</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={styles.input}
          />

          <Text style={styles.label}>Lykilorð (a.m.k. 8 stafir)</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
          />

          <View style={styles.adminRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.adminTitle}>Gera að stjórnanda</Text>
              <Text style={styles.adminSub}>
                Fær Stjórnun í appinu og fullt stjórnborð á vefnum.
              </Text>
            </View>
            <Switch
              value={makeAdmin}
              onValueChange={setMakeAdmin}
              trackColor={{ true: "#2563eb", false: "#cbd5e1" }}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, !canCreate && styles.disabled]}
            disabled={!canCreate}
            onPress={create}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Stofna starfsmann</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelLink}
            onPress={() => setShowCreate(false)}
          >
            <Text style={styles.cancelText}>Hætta við</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.newButton} onPress={() => setShowCreate(true)}>
          <ThemeIcon name="person-add-outline" size={36} />
          <Text style={styles.newButtonText}>Stofna nýjan starfsmann</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Starfsmenn ({employees.length})</Text>
      <View style={styles.card}>
        {employees.length === 0 && !loading ? (
          <Text style={styles.muted}>Engir starfsmenn skráðir.</Text>
        ) : (
          employees.map((e, i) => (
            <View key={e.employee_id} style={[styles.row, i > 0 && styles.rowBorder]}>
              {photos[e.employee_id] ? (
                <Image source={{ uri: photos[e.employee_id]! }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarText}>{initials(e.full_name)}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {e.full_name}
                  </Text>
                  {e.is_admin && (
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>Admin</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.sub} numberOfLines={1}>
                  {e.email ?? "Ekkert netfang"}
                  {e.status !== "active" ? " · óvirkur" : ""}
                </Text>
              </View>
              <Switch
                value={e.is_admin}
                onValueChange={() => toggleAdmin(e)}
                disabled={!e.has_login}
                trackColor={{ true: "#2563eb", false: "#cbd5e1" }}
              />
            </View>
          ))
        )}
      </View>
      <Text style={styles.hint}>
        Rofinn gerir starfsmann að stjórnanda (eða afturkallar). Starfsmenn án
        innskráningar þurfa netfang og lykilorð fyrst.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12 },
  muted: { color: "#94a3b8" },
  hint: { color: "#94a3b8", fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  newButton: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  newButtonText: { fontSize: 16, fontWeight: "700", color: "#2563eb" },
  createHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  createTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  label: { fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#f8fafc",
  },
  adminRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 14,
  },
  adminTitle: { fontWeight: "700", color: "#0f172a", fontSize: 15 },
  adminSub: { color: "#64748b", fontSize: 12.5, marginTop: 3 },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.5 },
  cancelLink: { alignItems: "center", paddingVertical: 12 },
  cancelText: { color: "#64748b", fontWeight: "600" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#334155", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#e2e8f0" },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  name: { fontSize: 15, fontWeight: "600", color: "#0f172a", flexShrink: 1 },
  adminBadge: {
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  adminBadgeText: { color: "#2563eb", fontSize: 10.5, fontWeight: "700" },
  sub: { fontSize: 13, color: "#64748b", marginTop: 1 },
});
