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
  Modal,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Nýr starfsmaður
  const [fullName, setFullName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [emailUser, setEmailUser] = useState("");
  const [domain, setDomain] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  // Breyta starfsmanni
  const [editFor, setEditFor] = useState<EmployeeRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editAdmin, setEditAdmin] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(async () => {
    // Lén félagsins: netfang starfsmanns verður notandanafn@lén
    supabase
      .rpc("my_company_domain")
      .then(({ data }) => setDomain((data as string | null) ?? null));
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

  const fullEmail = domain
    ? `${emailUser.trim().toLowerCase()}@${domain}`
    : emailUser.trim().toLowerCase();

  async function create() {
    setBusy(true);
    try {
      const kt = nationalId.replace(/\D/g, "");
      const { data: emp, error } = await supabase.rpc("create_employee_with_login", {
        p_full_name: fullName.trim(),
        p_employee_no: kt || null, // kennitala er starfsmannanúmerið
        p_phone: phone.trim() || null,
        p_email: fullEmail,
        p_national_id: kt || null,
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
        `${fullName.trim()} getur nú skráð sig inn með ${fullEmail}.`
      );
      setFullName("");
      setNationalId("");
      setEmailUser("");
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

  async function openEdit(e: EmployeeRow) {
    setEditFor(e);
    setEditName(e.full_name);
    setEditPassword("");
    setEditAdmin(e.is_admin);
    // Núverandi sími forfylltur svo hann glatist ekki við vistun
    const { data } = await supabase
      .from("employees")
      .select("phone")
      .eq("id", e.employee_id)
      .single();
    setEditPhone(((data as { phone: string | null } | null)?.phone ?? "") || "");
  }

  async function saveEdit() {
    if (!editFor) return;
    setEditBusy(true);
    try {
      const { error } = await supabase.rpc("update_employee", {
        p_id: editFor.employee_id,
        p_full_name: editName.trim() || editFor.full_name,
        p_phone: editPhone.trim() || null,
        p_email: editFor.email,
        p_status: editFor.status,
      });
      if (error) throw new Error(error.message);
      if (editPassword.length > 0) {
        if (editPassword.length < 6) {
          throw new Error("Lykilorð þarf a.m.k. 6 stafi.");
        }
        const { error } = await supabase.rpc("set_employee_password", {
          p_employee_id: editFor.employee_id,
          p_password: editPassword,
        });
        if (error) throw new Error(error.message);
      }
      if (editAdmin !== editFor.is_admin) {
        const { error } = await supabase.rpc("employee_set_admin", {
          p_employee_id: editFor.employee_id,
          p_admin: editAdmin,
        });
        if (error) throw new Error(error.message);
      }
      Alert.alert(
        "Vistað",
        editPassword
          ? `Breytingar vistaðar — nýja lykilorðið gildir strax.`
          : "Breytingar vistaðar."
      );
      setEditFor(null);
      load();
    } catch (e) {
      Alert.alert("Villa", translateError(e instanceof Error ? e.message : "Tókst ekki."));
    } finally {
      setEditBusy(false);
    }
  }

  const canCreate =
    !busy &&
    fullName.trim().length > 1 &&
    nationalId.replace(/\D/g, "").length === 10 &&
    (domain ? emailUser.trim().length > 0 : emailUser.includes("@")) &&
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

          <Text style={styles.label}>Kennitala (verður starfsmannanúmer)</Text>
          <TextInput
            value={nationalId}
            onChangeText={setNationalId}
            keyboardType="number-pad"
            placeholder="0000000000"
            maxLength={11}
            style={styles.input}
          />

          <Text style={styles.label}>Netfang (verður innskráning)</Text>
          {domain ? (
            <View style={styles.emailRow}>
              <TextInput
                value={emailUser}
                onChangeText={setEmailUser}
                autoCapitalize="none"
                placeholder="notandanafn"
                style={[styles.input, { flex: 1 }]}
              />
              <View style={styles.domainBox}>
                <Text style={styles.domainText}>@{domain}</Text>
              </View>
            </View>
          ) : (
            <TextInput
              value={emailUser}
              onChangeText={setEmailUser}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="nafn@daemi.is"
              style={styles.input}
            />
          )}

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
              <TouchableOpacity
                style={styles.rowBody}
                onPress={() =>
                  router.push({
                    pathname: "/admin-track",
                    params: { id: e.employee_id, name: e.full_name },
                  })
                }
              >
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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={styles.sub} numberOfLines={1}>
                      {e.email ?? "Ekkert netfang"}
                      {e.status !== "active" ? " · óvirkur" : ""}
                    </Text>
                    <Ionicons name="footsteps-outline" size={12} color="#94a3b8" />
                  </View>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openEdit(e)} style={styles.editButton}>
                <Ionicons name="pencil-outline" size={17} color="#2563eb" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
      <Text style={styles.hint}>
        Ýttu á starfsmann til að sjá ferðir hans á korti — blýantinn til að
        breyta skráningu hans (nafn, sími, lykilorð, stjórnandaréttindi).
      </Text>

      {/* Breyta starfsmanni */}
      <Modal
        visible={editFor != null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditFor(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Breyta: {editFor?.full_name}</Text>

            <Text style={styles.label}>Fullt nafn</Text>
            <TextInput value={editName} onChangeText={setEditName} style={styles.input} />

            <Text style={styles.label}>Símanúmer</Text>
            <TextInput
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
              style={styles.input}
            />

            <Text style={styles.label}>Nýtt lykilorð (autt = óbreytt)</Text>
            <TextInput
              value={editPassword}
              onChangeText={setEditPassword}
              secureTextEntry
              placeholder="A.m.k. 6 stafir"
              style={styles.input}
            />

            <View style={styles.adminRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.adminTitle}>Stjórnandi félagsins</Text>
                <Text style={styles.adminSub}>
                  Fær Stjórnun í appinu og fullt stjórnborð á vefnum.
                </Text>
              </View>
              <Switch
                value={editAdmin}
                onValueChange={setEditAdmin}
                disabled={!editFor?.has_login}
                trackColor={{ true: "#2563eb", false: "#cbd5e1" }}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, editBusy && styles.disabled]}
              disabled={editBusy}
              onPress={saveEdit}
            >
              {editBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Vista breytingar</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelLink}
              onPress={() => setEditFor(null)}
            >
              <Text style={styles.cancelText}>Hætta við</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  emailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  domainBox: {
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 12,
  },
  domainText: { color: "#2563eb", fontWeight: "700", fontSize: 14 },
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
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  editButton: {
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    padding: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modalSheet: { backgroundColor: "#fff", borderRadius: 18, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
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
