// Stjórnendur stofna verkefni beint í appinu: númer, heiti, heimilisfang
// og staðsetning valin á korti (ýtt á kortið eða "Nota mína staðsetningu").
// Opið verkefni (sjálfgefið): allir starfsmenn geta skráð sig inn.
// Verkefnastjóri er valkvæður.
import { useEffect, useRef, useState } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Circle } from "react-native-maps";
import { supabase } from "@/lib/supabase";
import { ensureForegroundPermission, getCurrentFix } from "@/lib/location";

interface UserOpt {
  id: string;
  email: string;
}

export default function AdminProjectNew() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [projectNo, setProjectNo] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [radius, setRadius] = useState("100");
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [open, setOpen] = useState(true);
  const [managers, setManagers] = useState<UserOpt[]>([]);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [showManagers, setShowManagers] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("users")
      .select("id, email")
      .eq("status", "active")
      .order("email")
      .then(({ data }) => setManagers((data as UserOpt[]) ?? []));
  }, []);

  async function useMyLocation() {
    const ok = await ensureForegroundPermission();
    if (!ok) {
      Alert.alert("Staðsetning", "Kveiktu á staðsetningarheimild.");
      return;
    }
    try {
      const fix = await getCurrentFix();
      const coord = { latitude: fix.lat, longitude: fix.lng };
      setPin(coord);
      mapRef.current?.animateToRegion(
        { ...coord, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        400
      );
    } catch {
      Alert.alert("Villa", "Náði ekki staðsetningu — reyndu úti eða við glugga.");
    }
  }

  async function create() {
    if (!projectNo.trim() || !name.trim() || !pin) return;
    setBusy(true);
    const { error } = await supabase.rpc("create_project", {
      p_project_no: projectNo.trim(),
      p_name: name.trim(),
      p_description: null,
      p_address: address.trim() || null,
      p_manager_user_id: managerId,
      p_start_date: null,
      p_end_date: null,
      p_lat: pin.latitude,
      p_lng: pin.longitude,
      p_radius_m: Math.max(20, parseInt(radius, 10) || 100),
      p_open: open,
    });
    setBusy(false);
    if (error) {
      Alert.alert(
        "Villa",
        error.message.includes("duplicate")
          ? "Verkefnisnúmerið er þegar til."
          : error.message
      );
      return;
    }
    Alert.alert("Stofnað", `Verkefnið ${projectNo.trim()} ${name.trim()} er komið í loftið.`);
    router.back();
  }

  const canCreate = !busy && projectNo.trim().length > 0 && name.trim().length > 0 && !!pin;
  const radiusM = Math.max(20, parseInt(radius, 10) || 100);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ width: 110 }}>
            <Text style={styles.label}>Númer</Text>
            <TextInput
              value={projectNo}
              onChangeText={setProjectNo}
              placeholder="t.d. 103"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Heiti verkefnis</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="t.d. Grandagarður 12"
              style={styles.input}
            />
          </View>
        </View>

        <Text style={styles.label}>Heimilisfang (valfrjálst)</Text>
        <TextInput value={address} onChangeText={setAddress} style={styles.input} />

        <Text style={styles.label}>Verksvæði — ýttu á kortið til að setja pinna</Text>
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
                <Marker
                  coordinate={pin}
                  draggable
                  onDragEnd={(e) => setPin(e.nativeEvent.coordinate)}
                />
                <Circle
                  center={pin}
                  radius={radiusM}
                  strokeColor="#2563eb"
                  fillColor="rgba(37,99,235,0.15)"
                />
              </>
            )}
          </MapView>
        </View>
        <TouchableOpacity style={styles.myLocation} onPress={useMyLocation}>
          <Ionicons name="locate" size={16} color="#2563eb" />
          <Text style={styles.myLocationText}>Nota mína staðsetningu</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Radíus verksvæðis (metrar)</Text>
        <TextInput
          value={radius}
          onChangeText={setRadius}
          keyboardType="number-pad"
          style={styles.input}
        />

        {/* Opið eða lokað verkefni */}
        <View style={styles.openRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.openTitle}>Opið öllum starfsmönnum</Text>
            <Text style={styles.openSub}>
              {open
                ? "Allir starfsmenn félagsins sjá verkefnið og geta skráð sig inn."
                : "Lokað: aðeins starfsmenn sem fá úthlutun (í stjórnborðinu) sjá það."}
            </Text>
          </View>
          <Switch
            value={open}
            onValueChange={setOpen}
            trackColor={{ true: "#2563eb", false: "#cbd5e1" }}
          />
        </View>

        {/* Verkefnastjóri — valkvætt */}
        <Text style={styles.label}>Verkefnastjóri (valfrjálst)</Text>
        <TouchableOpacity
          style={styles.managerToggle}
          onPress={() => setShowManagers((v) => !v)}
        >
          <Ionicons name="person-outline" size={16} color="#334155" />
          <Text style={styles.managerToggleText}>
            {managerId
              ? managers.find((m) => m.id === managerId)?.email ?? "Valinn"
              : "Enginn verkefnastjóri"}
          </Text>
          <Ionicons
            name={showManagers ? "chevron-up" : "chevron-down"}
            size={16}
            color="#94a3b8"
          />
        </TouchableOpacity>
        {showManagers && (
          <View style={styles.managerList}>
            <TouchableOpacity
              style={[styles.managerRow, managerId == null && styles.managerRowActive]}
              onPress={() => {
                setManagerId(null);
                setShowManagers(false);
              }}
            >
              <Text style={[styles.managerText, managerId == null && styles.managerTextActive]}>
                Enginn verkefnastjóri
              </Text>
            </TouchableOpacity>
            {managers.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.managerRow, managerId === m.id && styles.managerRowActive]}
                onPress={() => {
                  setManagerId(m.id);
                  setShowManagers(false);
                }}
              >
                <Text
                  style={[styles.managerText, managerId === m.id && styles.managerTextActive]}
                >
                  {m.email}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, !canCreate && styles.disabled]}
          disabled={!canCreate}
          onPress={create}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.buttonText}>Stofna verkefni</Text>
            </>
          )}
        </TouchableOpacity>
        {!pin && (
          <Text style={styles.hint}>Settu pinna á kortið til að virkja hnappinn.</Text>
        )}
        {!open && (
          <Text style={styles.hint}>
            Mundu að úthluta starfsmönnum á lokaða verkefnið í stjórnborðinu.
          </Text>
        )}
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
  mapWrap: {
    height: 260,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
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
  myLocationText: { color: "#2563eb", fontWeight: "600" },
  openRow: {
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
  openTitle: { fontWeight: "700", color: "#0f172a", fontSize: 15 },
  openSub: { color: "#64748b", fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  managerToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#f8fafc",
  },
  managerToggleText: { flex: 1, color: "#334155", fontWeight: "500", fontSize: 14 },
  managerList: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    marginTop: 6,
    maxHeight: 220,
    overflow: "hidden",
  },
  managerRow: { padding: 12, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  managerRowActive: { backgroundColor: "#eff6ff" },
  managerText: { fontSize: 14, color: "#334155" },
  managerTextActive: { color: "#2563eb", fontWeight: "700" },
  button: {
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.5 },
  hint: { color: "#94a3b8", fontSize: 12, textAlign: "center", marginTop: 8 },
});
