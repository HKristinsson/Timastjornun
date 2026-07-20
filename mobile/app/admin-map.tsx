// Kort stjórnenda: lifandi staðsetning allra innskráðra starfsmanna —
// aðeins innan tímaglugga félagsins (bakendinn framfylgir).
// Smellt á starfsmann á kortinu → spjald með mynd og upplýsingum.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import MapView, { Marker } from "react-native-maps";
import { supabase } from "@/lib/supabase";
import { employeePhotoUrl } from "@/lib/mail";

interface Loc {
  employee_id: string;
  full_name: string;
  photo_path: string | null;
  project_no: string;
  project_name: string;
  lat: number;
  lng: number;
  recorded_at: string;
  inside_geofence: boolean | null;
  minutes_ago: number;
}

const REFRESH_MS = 60_000;

function initials(name: string): string {
  return name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AdminMap() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [closed, setClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Loc | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("employee_locations");
    setLoading(false);
    if (error) {
      setClosed(error.message.includes("TRACKING_CLOSED"));
      setLocs([]);
      return;
    }
    setClosed(false);
    const list = (data ?? []) as Loc[];
    setLocs(list);
    if (list.length > 0 && mapRef.current) {
      mapRef.current.fitToCoordinates(
        list.map((l) => ({ latitude: l.lat, longitude: l.lng })),
        { edgePadding: { top: 80, bottom: 220, left: 60, right: 60 }, animated: true }
      );
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // Mynd valins starfsmanns
  useEffect(() => {
    setPhotoUrl(null);
    if (selected?.photo_path) {
      employeePhotoUrl(selected.photo_path).then(setPhotoUrl).catch(() => {});
    }
  }, [selected]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: 64.13,
          longitude: -21.9,
          latitudeDelta: 0.25,
          longitudeDelta: 0.25,
        }}
        onPress={() => setSelected(null)}
      >
        {locs.map((l) => (
          <Marker
            key={l.employee_id}
            coordinate={{ latitude: l.lat, longitude: l.lng }}
            onPress={() => setSelected(l)}
          >
            <View
              style={[
                styles.marker,
                l.inside_geofence === false && styles.markerOutside,
              ]}
            >
              <Text style={styles.markerText}>{initials(l.full_name)}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Til baka</Text>
        </TouchableOpacity>
        {loading && <ActivityIndicator color="#2563eb" />}
      </View>

      {closed && (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>⏰ Utan tímaglugga</Text>
          <Text style={styles.noticeText}>
            Staðsetning starfsmanna er aðeins sýnileg innan þess tíma sem er
            stilltur fyrir félagið (sjálfgefið 08:00–16:00 virka daga).
          </Text>
        </View>
      )}
      {!closed && !loading && locs.length === 0 && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Enginn starfsmaður er innskráður með staðsetningu núna.
          </Text>
        </View>
      )}

      {selected && (
        <View style={styles.card}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoFallback]}>
              <Text style={styles.photoInitials}>{initials(selected.full_name)}</Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardName}>{selected.full_name}</Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {selected.project_no} {selected.project_name}
            </Text>
            <Text style={styles.cardMeta}>
              Staðsetning fyrir {selected.minutes_ago} mín
              {selected.inside_geofence === false ? " · ⚠ utan svæðis" : ""}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setSelected(null)}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: "absolute",
    top: 56,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backButton: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  backText: { color: "#2563eb", fontWeight: "700", fontSize: 15 },
  marker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#2563eb",
    borderWidth: 3,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  markerOutside: { backgroundColor: "#f59e0b" },
  markerText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  notice: {
    position: "absolute",
    top: 110,
    left: 16,
    right: 16,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: 14,
    padding: 14,
  },
  noticeTitle: { fontWeight: "700", color: "#92400e", marginBottom: 4 },
  noticeText: { color: "#92400e", fontSize: 13, lineHeight: 18 },
  card: {
    position: "absolute",
    bottom: 30,
    left: 16,
    right: 16,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  photo: { width: 68, height: 68, borderRadius: 14, backgroundColor: "#e2e8f0" },
  photoFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
  },
  photoInitials: { color: "#fff", fontWeight: "800", fontSize: 20 },
  cardName: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  cardSub: { fontSize: 14, color: "#475569", marginTop: 2 },
  cardMeta: { fontSize: 12, color: "#94a3b8", marginTop: 3 },
  close: { fontSize: 18, color: "#94a3b8", padding: 6 },
});
