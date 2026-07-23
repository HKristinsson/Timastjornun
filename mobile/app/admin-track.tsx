// Ferðir starfsmanns (stjórnendur): leið dagsins á korti + stopp með
// tímalengd á hverjum stað. Gögn safnast á vinnutíma (tímagluggi félagsins)
// og meðan starfsmaður er innskráður á verk.
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline } from "react-native-maps";
import { supabase } from "@/lib/supabase";
import ThemeIcon from "@/components/ThemeIcon";

interface TrackPoint {
  lat: number;
  lng: number;
  t: string;
}

interface Stop {
  lat: number;
  lng: number;
  from: string;
  to: string;
  minutes: number;
  place_kind: string | null;
  place_name: string | null;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString("is-IS", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} klst ${m} mín` : `${m} mín`;
}

export default function AdminTrack() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const [date, setDate] = useState(new Date());
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("employee_day_track", {
      p_employee_id: id,
      p_date: isoDate(date),
    });
    setLoading(false);
    if (error) {
      setPoints([]);
      setStops([]);
      return;
    }
    const track = data as { points: TrackPoint[]; stops: Stop[] };
    setPoints(track.points ?? []);
    setStops(track.stops ?? []);
  }, [id, date]);

  useEffect(() => {
    load();
  }, [load]);

  function shiftDay(delta: number) {
    setDate((d) => new Date(d.getTime() + delta * 86400_000));
  }

  const region =
    points.length > 0
      ? {
          latitude: points.reduce((s, p) => s + p.lat, 0) / points.length,
          longitude: points.reduce((s, p) => s + p.lng, 0) / points.length,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }
      : { latitude: 64.13, longitude: -21.9, latitudeDelta: 0.25, longitudeDelta: 0.25 };

  const isToday = isoDate(date) === isoDate(new Date());

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{name}</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.dateButton} onPress={() => shiftDay(-1)}>
            <Ionicons name="chevron-back" size={18} color="#2563eb" />
          </TouchableOpacity>
          <Text style={styles.dateText}>
            {date.toLocaleDateString("is-IS", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
            {isToday ? " (í dag)" : ""}
          </Text>
          <TouchableOpacity
            style={[styles.dateButton, isToday && { opacity: 0.3 }]}
            disabled={isToday}
            onPress={() => shiftDay(1)}
          >
            <Ionicons name="chevron-forward" size={18} color="#2563eb" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mapWrap}>
        <MapView style={{ flex: 1 }} region={region}>
          {points.length > 1 && (
            <Polyline
              coordinates={points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
              strokeColor="#2563eb"
              strokeWidth={3}
            />
          )}
          {stops.map((s, i) => (
            <Marker
              key={i}
              coordinate={{ latitude: s.lat, longitude: s.lng }}
              title={s.place_name ?? `Stopp ${i + 1}`}
              description={`${timeStr(s.from)}–${timeStr(s.to)} · ${fmtDuration(s.minutes)}`}
            >
              <View style={styles.stopMarker}>
                <Text style={styles.stopMarkerText}>{i + 1}</Text>
              </View>
            </Marker>
          ))}
        </MapView>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#2563eb" />
          </View>
        )}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={{ padding: 16 }}>
        {!loading && points.length === 0 ? (
          <View style={styles.emptyCard}>
            <ThemeIcon name="footsteps-outline" size={40} />
            <Text style={styles.emptyText}>
              Engar staðsetningar skráðar þennan dag. Gögn safnast á vinnutíma
              (tímagluggi félagsins) þegar starfsmaðurinn er með appið.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>
              Stopp dagsins ({stops.length}) · {points.length} punktar
            </Text>
            {stops.map((s, i) => (
              <View key={i} style={styles.stopRow}>
                <View style={styles.stopNum}>
                  <Text style={styles.stopNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopTime}>
                    {timeStr(s.from)} – {timeStr(s.to)}
                  </Text>
                  {s.place_name ? (
                    <Text
                      style={[
                        styles.stopPlace,
                        s.place_kind === "project" && { color: "#16a34a" },
                      ]}
                      numberOfLines={1}
                    >
                      {s.place_kind === "project" ? "🔧 " : "📍 "}
                      {s.place_name}
                    </Text>
                  ) : (
                    <Text style={styles.stopCoords}>
                      Óskráður staður · {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                    </Text>
                  )}
                </View>
                <Text style={styles.stopDuration}>{fmtDuration(s.minutes)}</Text>
              </View>
            ))}
            {stops.length === 0 && !loading && (
              <Text style={styles.muted}>
                Engin stopp fundust — starfsmaðurinn var á ferðinni.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  header: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  name: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  dateButton: {
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    padding: 8,
  },
  dateText: { fontSize: 15, fontWeight: "600", color: "#334155" },
  mapWrap: { height: 300 },
  loadingOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 8,
  },
  stopMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#dc2626",
    borderWidth: 2.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  stopMarkerText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  list: { flex: 1 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#334155", marginBottom: 10 },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    gap: 10,
  },
  emptyText: { color: "#64748b", fontSize: 13.5, textAlign: "center", lineHeight: 19 },
  muted: { color: "#94a3b8", fontSize: 13.5 },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 13,
    marginBottom: 8,
  },
  stopNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  stopNumText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  stopTime: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  stopCoords: { fontSize: 12, color: "#94a3b8", marginTop: 1 },
  stopPlace: { fontSize: 13, color: "#f59e0b", fontWeight: "600", marginTop: 1 },
  stopDuration: { fontSize: 14, fontWeight: "700", color: "#2563eb" },
});
