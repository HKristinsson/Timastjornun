// Senda tímaskýrslu: valið tímabil + verk (eða öll) → CSV-skjal sent á
// netfang gegnum skilaboðakerfið (innri netföng fá það beint í innhólfið;
// ytri netföng bíða tölvupóstveitu).
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
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import {
  sendMessage,
  uploadAttachmentBase64,
  addOutboundAttachment,
} from "@/lib/mail";

interface ProjectOpt {
  id: string;
  project_no: string;
  name: string;
}

interface ReportRow {
  employee_name: string;
  employee_no: string | null;
  project_no: string;
  project_name: string;
  task_no: string | null;
  task_name: string | null;
  check_in_at: string;
  check_out_at: string | null;
  worked_hours: number | null;
  status: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// UTF-8 texti -> base64 (með BOM svo Excel opni íslenska stafi rétt)
function utf8ToBase64(str: string): string {
  const withBom = "﻿" + str;
  const utf8 = encodeURIComponent(withBom).replace(/%([0-9A-F]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16))
  );
  return btoa(utf8);
}

export default function AdminReport() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null); // null = öll verk
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 30 * 86400_000)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: projs }, { data: session }] = await Promise.all([
      supabase.from("v_projects").select("id, project_no, name").order("project_no"),
      supabase.auth.getUser(),
    ]);
    setProjects((projs as ProjectOpt[]) ?? []);
    if (session.user?.email) setEmail((e) => e || session.user!.email!);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function send() {
    const rcpt = email.trim().toLowerCase();
    if (!rcpt.includes("@")) {
      Alert.alert("Villa", "Sláðu inn gilt netfang.");
      return;
    }
    setBusy(true);
    try {
      // 1) Sækja tímafærslur tímabilsins
      let q = supabase
        .from("v_time_entries")
        .select(
          "employee_name, employee_no, project_no, project_name, task_no, task_name, check_in_at, check_out_at, worked_hours, status"
        )
        .gte("check_in_at", `${from}T00:00:00Z`)
        .lt("check_in_at", `${to}T23:59:59Z`)
        .order("check_in_at");
      if (projectId) q = q.eq("project_id", projectId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = (data as ReportRow[]) ?? [];

      // 2) Byggja CSV (semíkommur — Excel-vænt á Íslandi)
      const header =
        "Starfsmaður;Starfsm.nr;Verk;Verkheiti;Undirnr;Undirheiti;Innskráning;Útskráning;Klst;Staða";
      const lines = rows.map((r) =>
        [
          r.employee_name,
          r.employee_no ?? "",
          r.project_no,
          r.project_name,
          r.task_no ?? "",
          r.task_name ?? "",
          new Date(r.check_in_at).toLocaleString("is-IS"),
          r.check_out_at ? new Date(r.check_out_at).toLocaleString("is-IS") : "",
          r.worked_hours != null ? String(r.worked_hours).replace(".", ",") : "",
          r.status,
        ]
          .map((x) => `"${String(x).replace(/"/g, '""')}"`)
          .join(";")
      );
      const total = rows.reduce((s, r) => s + (r.worked_hours ?? 0), 0);
      const csv = [header, ...lines, "", `"Samtals";;;;;;;;"${String(Math.round(total * 100) / 100).replace(".", ",")}";`].join("\r\n");

      const projLabel = projectId
        ? projects.find((p) => p.id === projectId)
        : null;
      const scope = projLabel ? `${projLabel.project_no} ${projLabel.name}` : "Öll verk";
      const filename = `timaskyrsla-${from}-${to}.csv`;

      // 3) Hlaða skjalinu upp og senda
      const path = await uploadAttachmentBase64(utf8ToBase64(csv), filename, "text/csv");
      const sent = await sendMessage(
        rcpt,
        `Tímaskýrsla ${from} – ${to} (${scope})`,
        `Meðfylgjandi er tímaskýrsla.\n\nTímabil: ${from} – ${to}\nVerk: ${scope}\nFærslur: ${rows.length}\nSamtals: ${Math.round(total * 100) / 100} klst`
      );
      await addOutboundAttachment(sent.id, filename, "text/csv", path, csv.length);

      Alert.alert(
        "Sent",
        `Skýrslan (${rows.length} færslur) var send á ${rcpt}.`
      );
      router.back();
    } catch (e) {
      Alert.alert("Villa", e instanceof Error ? e.message : "Tókst ekki að senda.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Frá (ÁÁÁÁ-MM-DD)</Text>
            <TextInput value={from} onChangeText={setFrom} style={styles.input} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Til</Text>
            <TextInput value={to} onChangeText={setTo} style={styles.input} />
          </View>
        </View>

        <Text style={styles.label}>Verk</Text>
        <TouchableOpacity
          style={[styles.projectRow, projectId == null && styles.projectRowActive]}
          onPress={() => setProjectId(null)}
        >
          <Text style={[styles.projectText, projectId == null && styles.projectTextActive]}>
            📋 Öll verk
          </Text>
        </TouchableOpacity>
        {projects.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.projectRow, projectId === p.id && styles.projectRowActive]}
            onPress={() => setProjectId(p.id)}
          >
            <Text
              style={[styles.projectText, projectId === p.id && styles.projectTextActive]}
            >
              {p.project_no} {p.name}
            </Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Senda á netfang</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <Text style={styles.hint}>
          Netföng innan kerfisins fá skýrsluna beint í innhólfið sitt (CSV-skjal
          sem Excel opnar). Ytri netföng bíða þar til tölvupóstveita er tengd.
        </Text>

        <TouchableOpacity
          style={[styles.button, (busy || !email.trim()) && styles.disabled]}
          disabled={busy || !email.trim()}
          onPress={send}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>📧 Senda skýrslu</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 30 },
  label: { fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#f8fafc",
  },
  projectRow: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    backgroundColor: "#f8fafc",
  },
  projectRowActive: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  projectText: { fontSize: 14, color: "#334155", fontWeight: "500" },
  projectTextActive: { color: "#2563eb", fontWeight: "700" },
  hint: { fontSize: 12, color: "#94a3b8", marginTop: 8, lineHeight: 17 },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.5 },
});
