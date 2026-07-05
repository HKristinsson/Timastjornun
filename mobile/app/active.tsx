import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { getCurrentFix } from "@/lib/location";
import { stopProjectGeofence } from "@/lib/geofence";

interface ActiveEntry {
  id: string;
  project_name: string;
  project_no: string;
  check_in_at: string;
}

const POLL_MS = 30_000; // staðsetning lesin á 30 sek fresti
const GRACE_SEC = 600; // 10 mín áður en sjálfvirk útskráning (skv. sjálfgefnu)

export default function Active() {
  const router = useRouter();
  const [entry, setEntry] = useState<ActiveEntry | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [inside, setInside] = useState<boolean | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [graceLeft, setGraceLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const entryRef = useRef<ActiveEntry | null>(null);
  entryRef.current = entry;

  // Sækja virka skráningu
  useEffect(() => {
    supabase
      .from("v_my_active_entry")
      .select("id, project_name, project_no, check_in_at")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          router.replace("/home");
          return;
        }
        setEntry(data as ActiveEntry);
      });
  }, []);

  // Klukka (uppfærir á sekúndu fresti)
  useEffect(() => {
    if (!entry) return;
    const start = new Date(entry.check_in_at).getTime();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [entry]);

  const doAutoCheckout = useCallback(async () => {
    const e = entryRef.current;
    if (!e) return;
    await supabase.rpc("auto_check_out", {
      p_time_entry_id: e.id,
      p_reason: "auto_geofence",
    });
    await stopProjectGeofence();
    Alert.alert("Sjálfvirk útskráning", "Þú varst skráð(ur) út þar sem þú fórst af svæðinu.");
    router.replace("/home");
  }, []);

  // Staðsetningarvöktun
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;

    async function poll() {
      const e = entryRef.current;
      if (!e || cancelled) return;
      try {
        const fix = await getCurrentFix();
        const { data, error } = await supabase.rpc("log_location", {
          p_time_entry_id: e.id,
          p_lat: fix.lat,
          p_lng: fix.lng,
          p_accuracy: fix.accuracy,
        });
        if (error) return;
        const isInside = data as boolean;
        setInside(isInside);
        setLastChecked(new Date());
        setGraceLeft(isInside ? null : (prev) => (prev == null ? GRACE_SEC : prev));
      } catch {
        // GPS gæti dottið út — höldum áfram, reynt aftur næst
      }
    }

    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [entry]);

  // Niðurtalning þegar utan svæðis
  useEffect(() => {
    if (graceLeft == null) return;
    if (graceLeft <= 0) {
      doAutoCheckout();
      return;
    }
    const t = setTimeout(() => setGraceLeft((g) => (g == null ? null : g - 1)), 1000);
    return () => clearTimeout(t);
  }, [graceLeft, doAutoCheckout]);

  async function checkOut() {
    if (!entry) return;
    setBusy(true);
    let fixData: { lat: number; lng: number; accuracy: number | null } | null = null;
    try {
      fixData = await getCurrentFix();
    } catch {
      // leyfum útskráningu þótt GPS náist ekki
    }
    const { error } = await supabase.rpc("check_out", {
      p_time_entry_id: entry.id,
      p_lat: fixData?.lat ?? null,
      p_lng: fixData?.lng ?? null,
      p_accuracy: fixData?.accuracy ?? null,
      p_note: null,
    });
    if (error) {
      setBusy(false);
      Alert.alert("Villa", error.message);
      return;
    }
    await stopProjectGeofence();
    setBusy(false);
    router.replace("/home");
  }

  if (!entry) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const warning = graceLeft != null;

  return (
    <View style={[styles.container, warning && styles.containerWarn]}>
      <Text style={styles.label}>VIRK SKRÁNING</Text>
      <Text style={styles.project}>
        {entry.project_no} {entry.project_name}
      </Text>

      <Text style={styles.timer}>{fmt(elapsed)}</Text>

      {warning ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>⚠ Þú ert utan svæðis</Text>
          <Text style={styles.warnText}>
            Sjálfvirk útskráning eftir {fmt(graceLeft ?? 0)}
          </Text>
          <Text style={styles.warnText}>Farðu aftur inn á svæðið til að halda áfram.</Text>
        </View>
      ) : (
        <Text style={styles.status}>
          {inside === null
            ? "📍 Athuga staðsetningu…"
            : inside
            ? "📍 Innan svæðis ✅"
            : "📍 Staðsetning óviss"}
        </Text>
      )}

      {lastChecked && (
        <Text style={styles.muted}>
          Síðast athugað kl.{" "}
          {lastChecked.toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      )}

      <TouchableOpacity style={styles.checkout} onPress={checkOut} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.checkoutText}>⏹ Skrá út</Text>}
      </TouchableOpacity>
    </View>
  );
}

function fmt(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 80, alignItems: "center", backgroundColor: "#f8fafc" },
  containerWarn: { backgroundColor: "#fff7ed" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  label: { fontSize: 12, color: "#94a3b8", fontWeight: "700" },
  project: { fontSize: 20, fontWeight: "600", marginTop: 8 },
  timer: { fontSize: 56, fontWeight: "200", marginVertical: 24, fontVariant: ["tabular-nums"] },
  status: { fontSize: 16, color: "#16a34a" },
  muted: { color: "#94a3b8", marginTop: 8 },
  warnBox: { backgroundColor: "#fff", borderRadius: 14, padding: 20, alignItems: "center", borderWidth: 1, borderColor: "#fdba74" },
  warnTitle: { fontSize: 18, fontWeight: "700", color: "#ea580c" },
  warnText: { color: "#9a3412", marginTop: 6, textAlign: "center" },
  checkout: { backgroundColor: "#dc2626", borderRadius: 12, paddingVertical: 16, paddingHorizontal: 60, marginTop: "auto", marginBottom: 24 },
  checkoutText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
