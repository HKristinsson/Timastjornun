// Verkefni-flipinn: öll verkefni með fjarlægð og innskráningu (aldrei sjálfvirk
// innskráning — starfsmaðurinn sér verkin og velur sjálfur), + veikindaskráning.
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
import {
  ensureForegroundPermission,
  ensureBackgroundPermission,
  getCurrentFix,
  distanceMeters,
  type Fix,
} from "@/lib/location";
import { startProjectGeofence } from "@/lib/geofence";
import { startTracking } from "@/lib/tracking";
import TaskPicker, { type ProjectTask } from "@/components/TaskPicker";

interface MyProject {
  id: string;
  project_no: string;
  name: string;
  address: string | null;
  radius_m: number | null;
  lat: number | null;
  lng: number | null;
}

export default function Projects() {
  const router = useRouter();
  const [fix, setFix] = useState<Fix | null>(null);
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasActive, setHasActive] = useState(false);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [taskProject, setTaskProject] = useState<MyProject | null>(null);
  const [taskOptions, setTaskOptions] = useState<ProjectTask[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: act } = await supabase
      .from("v_my_active_entry")
      .select("id")
      .maybeSingle();
    setHasActive(!!act);

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
    router.push("/active");
  }

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
      data={projects}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <TouchableOpacity style={styles.sickRow} onPress={() => router.push("/sick")}>
          <Ionicons name="medkit" size={20} color="#d97706" />
          <View style={{ flex: 1 }}>
            <Text style={styles.sickTitle}>Skrá veikindi eða frí</Text>
            <Text style={styles.sickSub}>Tilkynna veikinda- eða frídaga til verkstjóra</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </TouchableOpacity>
      }
      ListEmptyComponent={
        <Text style={styles.muted}>Engin verkefni úthlutuð.</Text>
      }
      renderItem={({ item }) => {
        const dist =
          fix && item.lat != null && item.lng != null
            ? distanceMeters(fix.lat, fix.lng, item.lat, item.lng)
            : null;
        const inside = dist != null && item.radius_m != null && dist <= item.radius_m;
        return (
          <View style={styles.card}>
            <Text style={styles.projName}>
              {item.project_no} {item.name}
            </Text>
            {item.address && <Text style={styles.addr}>{item.address}</Text>}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
              <Ionicons
                name="location"
                size={14}
                color={inside ? "#16a34a" : "#64748b"}
              />
              <Text style={inside ? styles.inside : styles.outside}>
                {dist == null
                  ? "Staðsetning óþekkt"
                  : inside
                  ? `Innan svæðis (${dist} m)`
                  : `${dist} m í burtu`}
              </Text>
            </View>
            {hasActive ? (
              <Text style={styles.activeNote}>
                Þú ert þegar innskráð(ur) á verk — skráðu þig fyrst út.
              </Text>
            ) : (
              <TouchableOpacity
                style={[styles.button, !inside && styles.buttonDisabled]}
                disabled={!inside || checkingIn === item.id}
                onPress={() => checkIn(item)}
              >
                {checkingIn === item.id ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {inside ? "Skrá inn" : "Of langt í burtu"}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        );
      }}
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
  muted: { color: "#94a3b8", textAlign: "center", marginTop: 40 },
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
  projName: { fontSize: 16, fontWeight: "600" },
  addr: { color: "#64748b", marginTop: 2 },
  inside: { color: "#16a34a" },
  outside: { color: "#64748b" },
  activeNote: { color: "#94a3b8", marginTop: 10, fontSize: 13 },
  button: { backgroundColor: "#2563eb", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  buttonDisabled: { backgroundColor: "#cbd5e1" },
  buttonText: { color: "#fff", fontWeight: "600" },
});
