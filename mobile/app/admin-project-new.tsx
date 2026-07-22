// Stjórnendur stofna verkefni beint í appinu: númer, heiti, heimilisfang
// og staðsetning valin á korti (ýtt á kortið eða "Nota mína staðsetningu").
import { useRef, useState } from "react";
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Circle } from "react-native-maps";
import { supabase } from "@/lib/supabase";
import { ensureForegroundPermission, getCurrentFix } from "@/lib/location";

export default function AdminProjectNew() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [projectNo, setProjectNo] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [radius, setRadius] = useState("100");
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [busy, setBusy] = useState(false);

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
      p_manager_user_id: null,
      p_start_date: null,
      p_end_date: null,
      p_lat: pin.latitude,
      p_lng: pin.longitude,
      p_radius_m: Math.max(20, parseInt(radius, 10) || 100),
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
