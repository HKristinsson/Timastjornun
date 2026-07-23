// Staðir (stjórnendur): skilgreindir staðir sem starfsmenn koma við á —
// höfuðstöðvar, verslanir o.fl. Stofna með korti, virkja/afvirkja, eyða,
// og sjá hve oft og lengi hver starfsmaður hefur verið á staðnum.
import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Circle } from "react-native-maps";
import { supabase } from "@/lib/supabase";
import { ensureForegroundPermission, getCurrentFix } from "@/lib/location";
import ThemeIcon from "@/components/ThemeIcon";

interface Place {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  active: boolean;
}

interface Visit {
  employee_id: string;
  full_name: string;
  visits: number;
  total_minutes: number;
  last_visit: string;
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} klst ${m} mín` : `${m} mín`;
}

export default function AdminPlaces() {
  const mapRef = useRef<MapView>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Nýr staður
  const [name, setName] = useState("");
  const [radius, setRadius] = useState("100");
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Heimsóknir
  const [openPlace, setOpenPlace] = useState<Place | null>(null);
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [visitsLoading, setVisitsLoading] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("v_places")
      .select("id, name, address, lat, lng, radius_m, active")
      .order("name");
    setPlaces((data as Place[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function useMyLocation() {
    try {
      const ok = await ensureForegroundPermission();
      if (!ok) return;
      const fix = await getCurrentFix();
      const coord = { latitude: fix.lat, longitude: fix.lng };
      setPin(coord);
      mapRef.current?.animateToRegion(
        { ...coord, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        400
      );
    } catch {
      Alert.alert("Staðsetning", "Náði ekki staðsetningu.");
    }
  }

  async function create() {
    if (!pin || !name.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc("place_create", {
      p_name: name.trim(),
      p_address: null,
      p_lat: pin.latitude,
      p_lng: pin.longitude,
      p_radius_m: Math.max(20, parseInt(radius, 10) || 100),
    });
    setBusy(false);
    if (error) {
      Alert.alert("Villa", error.message);
      return;
    }
    setName("");
    setPin(null);
    setShowCreate(false);
    load();
  }

  async function toggleActive(p: Place) {
    await supabase.rpc("place_update", { p_id: p.id, p_active: !p.active });
    load();
  }

  async function remove(p: Place) {
    const ok = await new Promise<boolean>((resolve) =>
      Alert.alert("Eyða stað", `Eyða „${p.name}"?`, [
        { text: "Hætta við", style: "cancel", onPress: () => resolve(false) },
        { text: "Eyða", style: "destructive", onPress: () => resolve(true) },
      ])
    );
    if (!ok) return;
    await supabase.rpc("place_delete", { p_id: p.id });
    if (openPlace?.id === p.id) setOpenPlace(null);
    load();
  }

  async function openVisits(p: Place) {
    if (openPlace?.id === p.id) {
      setOpenPlace(null);
      return;
    }
    setOpenPlace(p);
    setVisits(null);
    setVisitsLoading(true);
    const from = new Date(Date.now() - 30 * 86400_000).toISOString();
    const to = new Date().toISOString();
    const { data } = await supabase.rpc("place_visits", {
      p_place_id: p.id,
      p_from: from,
      p_to: to,
    });
    setVisitsLoading(false);
    setVisits((data ?? []) as Visit[]);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {showCreate ? (
        <View style={styles.card}>
          <View style={styles.createHeader}>
            <ThemeIcon name="location-outline" size={36} />
            <Text style={styles.createTitle}>Nýr staður</Text>
          </View>

          <Text style={styles.label}>Heiti (t.d. Höfuðstöðvar, BYKO Breidd)</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} />

          <Text style={styles.label}>Staðsetning — ýttu á kortið</Text>
          <View style={styles.mapWrap}>
            <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              initialRegion={{
                latitude: 64.13,
                longitude: -21.9,
                latitudeDelta: 0.2,
                longitudeDelta: 0.2,
              }}
              onPress={(e) => setPin(e.nativeEvent.coordinate)}
            >
              {pin && (
                <>
                  <Marker coordinate={pin} />
                  <Circle
                    center={pin}
                    radius={Math.max(20, parseInt(radius, 10) || 100)}
                    strokeColor="#f59e0b"
                    fillColor="rgba(245,158,11,0.15)"
                  />
                </>
              )}
            </MapView>
          </View>
          <TouchableOpacity style={styles.myLocation} onPress={useMyLocation}>
            <Ionicons name="locate" size={16} color="#2563eb" />
            <Text style={styles.myLocationText}>Nota mína staðsetningu</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Radíus (metrar)</Text>
          <TextInput
            value={radius}
            onChangeText={setRadius}
            keyboardType="number-pad"
            style={styles.input}
          />

          <TouchableOpacity
            style={[styles.button, (!pin || !name.trim() || busy) && styles.disabled]}
            disabled={!pin || !name.trim() || busy}
            onPress={create}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.buttonText}>Vista stað</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelLink} onPress={() => setShowCreate(false)}>
            <Text style={styles.cancelText}>Hætta við</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.newButton} onPress={() => setShowCreate(true)}>
          <ThemeIcon name="location-outline" size={36} />
          <Text style={styles.newButtonText}>Stofna nýjan stað</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Staðir ({places.length})</Text>
      {places.length === 0 && !loading ? (
        <View style={styles.card}>
          <Text style={styles.muted}>
            Engir staðir skráðir. Stofnaðu t.d. höfuðstöðvar eða verslanir sem
            starfsmenn koma við á — stopp þar merkjast þá með heiti staðarins
            í ferðum og skýrslum.
          </Text>
        </View>
      ) : (
        places.map((p) => (
          <View key={p.id} style={[styles.card, !p.active && { opacity: 0.6 }]}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.placeName}>{p.name}</Text>
                <Text style={styles.placeSub}>
                  {p.lat.toFixed(5)}, {p.lng.toFixed(5)} · {p.radius_m} m
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.visitsButton,
                  openPlace?.id === p.id && styles.visitsButtonActive,
                ]}
                onPress={() => openVisits(p)}
              >
                <Text
                  style={[
                    styles.visitsButtonText,
                    openPlace?.id === p.id && { color: "#fff" },
                  ]}
                >
                  Heimsóknir
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleActive(p)} style={styles.iconButton}>
                <Ionicons
                  name={p.active ? "eye-outline" : "eye-off-outline"}
                  size={17}
                  color={p.active ? "#16a34a" : "#94a3b8"}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(p)} style={styles.iconButton}>
                <Ionicons name="trash-outline" size={17} color="#dc2626" />
              </TouchableOpacity>
            </View>

            {openPlace?.id === p.id && (
              <View style={styles.visitsBox}>
                <Text style={styles.visitsTitle}>Síðustu 30 dagar</Text>
                {visitsLoading ? (
                  <ActivityIndicator color="#2563eb" />
                ) : !visits || visits.length === 0 ? (
                  <Text style={styles.muted}>Engar heimsóknir á tímabilinu.</Text>
                ) : (
                  visits.map((v) => (
                    <View key={v.employee_id} style={styles.visitRow}>
                      <Text style={styles.visitName}>{v.full_name}</Text>
                      <Text style={styles.visitStats}>
                        {v.visits}× · {fmtDuration(v.total_minutes)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 10 },
  muted: { color: "#94a3b8", fontSize: 13.5, lineHeight: 19 },
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
  mapWrap: { height: 220, borderRadius: 12, overflow: "hidden" },
  myLocation: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#f8fafc",
  },
  myLocationText: { color: "#2563eb", fontWeight: "600", fontSize: 14 },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.5 },
  cancelLink: { alignItems: "center", paddingVertical: 12 },
  cancelText: { color: "#64748b", fontWeight: "600" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#334155", marginBottom: 8 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  placeName: { fontSize: 15.5, fontWeight: "600", color: "#0f172a" },
  placeSub: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  visitsButton: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 9,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  visitsButtonActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  visitsButtonText: { color: "#334155", fontWeight: "600", fontSize: 12.5 },
  iconButton: { padding: 6 },
  visitsBox: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 10,
  },
  visitsTitle: { fontSize: 12, fontWeight: "700", color: "#94a3b8", marginBottom: 6 },
  visitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  visitName: { fontSize: 14, color: "#0f172a", fontWeight: "500" },
  visitStats: { fontSize: 14, color: "#2563eb", fontWeight: "700" },
});
