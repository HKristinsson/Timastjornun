import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
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

interface MyProject {
  id: string;
  project_no: string;
  name: string;
  address: string | null;
  radius_m: number | null;
  lat: number | null;
  lng: number | null;
}

export default function ProjectSelect() {
  const router = useRouter();
  const [fix, setFix] = useState<Fix | null>(null);
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ok = await ensureForegroundPermission();
      if (!ok) {
        Alert.alert("Staðsetning", "Kveiktu á staðsetningarheimild til að skrá þig inn.");
        setLoading(false);
        return;
      }
      const f = await getCurrentFix();
      setFix(f);
      const { data } = await supabase
        .from("v_my_projects")
        .select("id, project_no, name, address, radius_m, lat, lng");
      setProjects((data as MyProject[]) ?? []);
      setLoading(false);
    })();
  }, []);

  async function checkIn(p: MyProject) {
    if (!fix) return;
    setCheckingIn(p.id);
    const { error } = await supabase.rpc("check_in", {
      p_project_id: p.id,
      p_lat: fix.lat,
      p_lng: fix.lng,
      p_accuracy: fix.accuracy,
      p_note: null,
    });
    if (error) {
      setCheckingIn(null);
      // Server skilar skýrri villu (t.d. OUTSIDE_AREA / LOW_ACCURACY)
      Alert.alert("Ekki hægt að skrá inn", translateError(error.message));
      return;
    }

    // Hefja bakgrunns-geofencing (skynjar að farið er af svæði þótt app sé lokað).
    // Krefst "Always" staðsetningarheimildar + tilkynningaheimildar.
    try {
      await ensureBackgroundPermission();
      await Notifications.requestPermissionsAsync();
      if (p.lat != null && p.lng != null && p.radius_m != null) {
        await startProjectGeofence(p.id, p.lat, p.lng, p.radius_m);
      }
    } catch {
      // Bakgrunnsvöktun mistókst (t.d. heimild hafnað) — forgrunnsvöktun virkar samt.
    }

    setCheckingIn(null);
    router.replace("/active");
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={projects}
      keyExtractor={(p) => p.id}
      ListEmptyComponent={
        <Text style={styles.muted}>
          Engin verkefni úthlutuð (eða Supabase ekki tengt).
        </Text>
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
            <Text style={inside ? styles.inside : styles.outside}>
              📍{" "}
              {dist == null
                ? "Staðsetning óþekkt"
                : inside
                ? `Innan svæðis (${dist} m)`
                : `${dist} m í burtu`}
            </Text>
            <TouchableOpacity
              style={[styles.button, !inside && styles.buttonDisabled]}
              disabled={!inside || checkingIn === item.id}
              onPress={() => checkIn(item)}
            >
              {checkingIn === item.id ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {inside ? "Skrá inn" : "Of langt"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        );
      }}
    />
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
  list: { backgroundColor: "#f8fafc", padding: 16 },
  muted: { color: "#94a3b8", textAlign: "center", marginTop: 40 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12 },
  projName: { fontSize: 16, fontWeight: "600" },
  addr: { color: "#64748b", marginTop: 2 },
  inside: { color: "#16a34a", marginTop: 8 },
  outside: { color: "#64748b", marginTop: 8 },
  button: { backgroundColor: "#2563eb", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  buttonDisabled: { backgroundColor: "#cbd5e1" },
  buttonText: { color: "#fff", fontWeight: "600" },
});
