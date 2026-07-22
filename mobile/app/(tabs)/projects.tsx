// Verkefni — fyrsti flipinn (aðalskjár). Efst: virk skráning (rautt kort) eða
// verk innan svæðis með beinni innskráningu; þar fyrir neðan öll verkefni með
// fjarlægð. Aldrei sjálfvirk innskráning — starfsmaðurinn velur sjálfur.
import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { supabase } from "@/lib/supabase";
import { registerPush } from "@/lib/push";
import {
  ensureForegroundPermission,
  ensureBackgroundPermission,
  getCurrentFix,
  distanceMeters,
  type Fix,
} from "@/lib/location";
import { startProjectGeofence } from "@/lib/geofence";
import { startTracking, stopTracking } from "@/lib/tracking";
import TaskPicker, { type ProjectTask } from "@/components/TaskPicker";

interface ActiveEntry {
  id: string;
  project_name: string;
  project_no: string;
  check_in_at: string;
  task_no: string | null;
  task_name: string | null;
}

interface MyProject {
  id: string;
  project_no: string;
  name: string;
  address: string | null;
  radius_m: number | null;
  lat: number | null;
  lng: number | null;
}

function sinceText(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} klst ${m} mín` : `${m} mín`;
}

export default function Projects() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveEntry | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [taskProject, setTaskProject] = useState<MyProject | null>(null);
  const [taskOptions, setTaskOptions] = useState<ProjectTask[]>([]);

  const load = useCallback(async () => {
    // Skrá push-token + hefja viðveru-vöktun (bakendinn virðir tímagluggann)
    registerPush();
    ensureBackgroundPermission()
      .then(() => startTracking())
      .catch(() => {});

    const { data: act } = await supabase
      .from("v_my_active_entry")
      .select("id, project_name, project_no, check_in_at, task_no, task_name")
      .maybeSingle();
    setActive((act as ActiveEntry) ?? null);

    const { data } = await supabase
      .from("v_my_projects")
      .select("id, project_no, name, address, radius_m, lat, lng");
    setProjects((data as MyProject[]) ?? []);

    try {
      const ok = await ensureForegroundPermission();
      if (ok) setFix(await getCurrentFix());
    } catch {
      // GPS náðist ekki — listinn sést samt
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Ef verkefnið hefur undirnúmer velur starfsmaðurinn fyrst
  async function checkIn(p: MyProject) {
    if (!fix) return;
    const { data: tasks } = await supabase
      .from("project_tasks")
      .select("id, task_no, name")
      .eq("project_id", p.id)
      .eq("active", true)
      .order("task_no");
    if (tasks && tasks.length > 0) {
      setTaskOptions(tasks as ProjectTask[]);
      setTaskProject(p);
      return;
    }
    doCheckIn(p, null);
  }

  async function doCheckIn(p: MyProject, taskId: string | null) {
    if (!fix) return;
    setTaskProject(null);
    setCheckingIn(p.id);
    const { error } = await supabase.rpc("check_in", {
      p_project_id: p.id,
      p_lat: fix.lat,
      p_lng: fix.lng,
      p_accuracy: fix.accuracy,
      p_note: null,
      p_task_id: taskId,
    });
    if (error) {
      setCheckingIn(null);
      Alert.alert("Ekki hægt að skrá inn", translateError(error.message));
      return;
    }
    try {
      await ensureBackgroundPermission();
      await Notifications.requestPermissionsAsync();
      if (p.lat != null && p.lng != null && p.radius_m != null) {
        await startProjectGeofence(p.id, p.lat, p.lng, p.radius_m);
      }
      await startTracking();
    } catch {
      // Bakgrunnsvöktun mistókst — forgrunnsvöktun virkar samt
    }
    setCheckingIn(null);
    load();
  }

  async function signOut() {
    await stopTracking();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // Verk innan svæðis raðast efst
  const withDist = projects.map((p) => {
    const dist =
      fix && p.lat != null && p.lng != null
        ? distanceMeters(fix.lat, fix.lng, p.lat, p.lng)
        : null;
    const inside = dist != null && p.radius_m != null && dist <= p.radius_m;
    return { ...p, dist, inside };
  });
  const sorted = [...withDist].sort((a, b) => {
    if (a.inside !== b.inside) return a.inside ? -1 : 1;
    return (a.dist ?? Number.MAX_SAFE_INTEGER) - (b.dist ?? Number.MAX_SAFE_INTEGER);
  });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
    {taskProject && (
      <TaskPicker
        visible
        projectName={`${taskProject.project_no} ${taskProject.name}`}
        tasks={taskOptions}
        onPick={(taskId) => doCheckIn(taskProject, taskId)}
        onCancel={() => setTaskProject(null)}
      />
    )}
    <FlatList
      style={styles.list}
      contentContainerStyle={{ paddingBottom: 30 }}
      data={sorted}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Tímaverk</Text>
            <TouchableOpacity onPress={signOut}>
              <Text style={styles.signout}>Útskrá</Text>
            </TouchableOpacity>
          </View>

          {active && (
            /* Virk skráning: rautt kort — opnar stöðuskjá (tímalengd + Skrá út) */
            <TouchableOpacity
              style={styles.activeCard}
              onPress={() => router.push("/active")}
            >
              <View style={styles.activeDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.activeTitle}>INNSKRÁÐ(UR) Á VERK</Text>
                <Text style={styles.activeProject}>
                  {active.project_no} {active.project_name}
                </Text>
                {active.task_no && (
                  <Text style={styles.activeTask}>
                    ↳ {active.task_no} {active.task_name}
                  </Text>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
                  <Ionicons name="time-outline" size={15} color="#fee2e2" />
                  <Text style={styles.activeTime}>{sinceText(active.check_in_at)}</Text>
                </View>
              </View>
              <Text style={styles.activeChev}>›</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.sickRow} onPress={() => router.push("/sick")}>
            <Ionicons name="medkit" size={20} color="#d97706" />
            <View style={{ flex: 1 }}>
              <Text style={styles.sickTitle}>Skrá veikindi eða frí</Text>
              <Text style={styles.sickSub}>Tilkynna veikinda- eða frídaga til verkstjóra</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </TouchableOpacity>

          {!fix && (
            <Text style={styles.gpsHint}>
              Kveiktu á staðsetningu til að sjá fjarlægð í verkefni.
            </Text>
          )}
        </>
      }
      ListEmptyComponent={<Text style={styles.muted}>Engin verkefni úthlutuð.</Text>}
      renderItem={({ item }) => (
        <View style={[styles.card, item.inside && styles.cardInside]}>
          <Text style={styles.projName}>
            {item.project_no} {item.name}
          </Text>
          {item.address && <Text style={styles.addr}>{item.address}</Text>}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
            <Ionicons
              name="location"
              size={14}
              color={item.inside ? "#16a34a" : "#64748b"}
            />
            <Text style={item.inside ? styles.inside : styles.outside}>
              {item.dist == null
                ? "Staðsetning óþekkt"
                : item.inside
                ? `Innan svæðis (${item.dist} m)`
                : `${item.dist} m í burtu`}
            </Text>
          </View>
          {active ? (
            active.project_no !== item.project_no && (
              <Text style={styles.activeNote}>
                Þú ert þegar innskráð(ur) á verk — skráðu þig fyrst út.
              </Text>
            )
          ) : item.inside ? (
            <TouchableOpacity
              style={styles.button}
              disabled={checkingIn === item.id}
              onPress={() => checkIn(item)}
            >
              {checkingIn === item.id ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="log-in" size={17} color="#fff" />
                  <Text style={styles.buttonText}>Skrá inn</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    />
    </>
  );
}

function translateError(msg: string): string {
  if (msg.includes("OUTSIDE_AREA")) return "Þú ert utan svæðis verkefnisins.";
  if (msg.includes("LOW_ACCURACY")) return "GPS-nákvæmni er ófullnægjandi. Reyndu aftur úti.";
  if (msg.includes("ALREADY_ACTIVE")) return "Þú ert þegar með virka skráningu.";
  if (msg.includes("NOT_ASSIGNED")) return "Þú hefur ekki aðgang að þessu verkefni.";
  return msg;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { backgroundColor: "#f1f5f9", padding: 16 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 40,
  },
  title: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  signout: { color: "#64748b" },
  muted: { color: "#94a3b8", textAlign: "center", marginTop: 40 },
  gpsHint: { color: "#94a3b8", fontSize: 13, marginBottom: 10 },
  activeCard: {
    backgroundColor: "#dc2626",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#dc2626",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  activeDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#fff" },
  activeTitle: { color: "#fecaca", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  activeProject: { color: "#fff", fontSize: 17, fontWeight: "700", marginTop: 2 },
  activeTask: { color: "#fee2e2", fontSize: 14, fontWeight: "600", marginTop: 2 },
  activeTime: { color: "#fee2e2", fontSize: 14 },
  activeChev: { color: "#fecaca", fontSize: 28 },
  sickRow: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sickTitle: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  sickSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  chev: { fontSize: 22, color: "#cbd5e1" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12 },
  cardInside: { borderWidth: 2, borderColor: "#16a34a" },
  projName: { fontSize: 16, fontWeight: "600" },
  addr: { color: "#64748b", marginTop: 2 },
  inside: { color: "#16a34a" },
  outside: { color: "#64748b" },
  activeNote: { color: "#94a3b8", marginTop: 10, fontSize: 13 },
  button: {
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    marginTop: 12,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
