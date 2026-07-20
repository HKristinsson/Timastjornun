import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
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

export default function Home() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [fix, setFix] = useState<Fix | null>(null);
  const [nearby, setNearby] = useState<MyProject[]>([]);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [taskProject, setTaskProject] = useState<MyProject | null>(null);
  const [taskOptions, setTaskOptions] = useState<ProjectTask[]>([]);

  const load = useCallback(async () => {
    // Skrá push-token tækisins (einu sinni) svo skilaboð berist þótt appið sé lokað
    registerPush();
    // Viðveru-vöktun á vinnutíma (bakendinn geymir aðeins innan tímaglugga félags)
    ensureBackgroundPermission()
      .then(() => startTracking())
      .catch(() => {});
    setLoading(true);

    const { data } = await supabase
      .from("v_my_active_entry")
      .select("id, project_name, project_no, check_in_at, task_no, task_name")
      .maybeSingle();
    const act = (data as ActiveEntry) ?? null;
    setActive(act);
    setLoading(false);

    // Verk í nánd: aðeins þegar ekki er virk skráning
    if (!act) {
      try {
        const ok = await ensureForegroundPermission();
        if (!ok) return;
        const f = await getCurrentFix();
        setFix(f);
        const { data: projs } = await supabase
          .from("v_my_projects")
          .select("id, project_no, name, address, radius_m, lat, lng");
        const all = (projs as MyProject[]) ?? [];
        setNearby(
          all.filter(
            (p) =>
              p.lat != null &&
              p.lng != null &&
              p.radius_m != null &&
              distanceMeters(f.lat, f.lng, p.lat, p.lng) <= p.radius_m
          )
        );
      } catch {
        // GPS náðist ekki — "Sjá öll verkefni" hnappurinn virkar áfram
      }
    } else {
      setNearby([]);
    }
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Tímaverk</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signout}>Útskrá</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.card}>
          <Text style={styles.muted}>Hleð…</Text>
        </View>
      ) : active ? (
        /* Virk skráning: áberandi rauður hnappur — opnar stöðuglugga
           með tímalengd, Skrá út og leið til baka í valmynd */
        <TouchableOpacity style={styles.activeCard} onPress={() => router.push("/active")}>
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
            <Text style={styles.activeTime}>⏱ {sinceText(active.check_in_at)}</Text>
          </View>
          <Text style={styles.activeChev}>›</Text>
        </TouchableOpacity>
      ) : (
        <>
          {/* Verk í nánd: hægt að skrá sig beint inn af heimaskjá */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>VERK Í NÁND</Text>
            {nearby.length === 0 ? (
              <Text style={styles.muted}>
                {fix
                  ? "Ekkert verkefni innan svæðis þar sem þú ert núna."
                  : "Kveiktu á staðsetningu til að sjá verk í nánd."}
              </Text>
            ) : (
              nearby.map((p) => (
                <View key={p.id} style={styles.nearbyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nearbyName}>
                      {p.project_no} {p.name}
                    </Text>
                    {p.address && <Text style={styles.nearbyAddr}>{p.address}</Text>}
                    <Text style={styles.nearbyInside}>📍 Innan svæðis</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.checkinButton}
                    disabled={checkingIn === p.id}
                    onPress={() => checkIn(p)}
                  >
                    {checkingIn === p.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.checkinButtonText}>Skrá inn</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          <TouchableOpacity
            style={styles.allProjects}
            onPress={() => router.push("/projects")}
          >
            <Text style={styles.allProjectsText}>📋 Sjá öll verkefni</Text>
          </TouchableOpacity>
        </>
      )}

      {taskProject && (
        <TaskPicker
          visible
          projectName={`${taskProject.project_no} ${taskProject.name}`}
          tasks={taskOptions}
          onPick={(taskId) => doCheckIn(taskProject, taskId)}
          onCancel={() => setTaskProject(null)}
        />
      )}
    </ScrollView>
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
  container: { padding: 20, paddingTop: 60, backgroundColor: "#f1f5f9", flexGrow: 1 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  signout: { color: "#64748b" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, marginBottom: 14 },
  cardLabel: { fontSize: 12, color: "#94a3b8", fontWeight: "600", marginBottom: 8 },
  muted: { color: "#94a3b8" },
  activeCard: {
    backgroundColor: "#dc2626",
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
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
  activeTime: { color: "#fee2e2", fontSize: 14, marginTop: 4 },
  activeChev: { color: "#fecaca", fontSize: 28 },
  nearbyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  nearbyName: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  nearbyAddr: { fontSize: 13, color: "#64748b", marginTop: 1 },
  nearbyInside: { fontSize: 13, color: "#16a34a", marginTop: 2 },
  checkinButton: {
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minWidth: 92,
    alignItems: "center",
  },
  checkinButtonText: { color: "#fff", fontWeight: "700" },
  allProjects: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  allProjectsText: { color: "#2563eb", fontWeight: "700", fontSize: 15 },
  linkRow: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  linkTitle: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  linkSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  chev: { fontSize: 22, color: "#cbd5e1" },
});
