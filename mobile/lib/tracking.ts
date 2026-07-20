// Samfelld staðsetningarskráning MEÐAN starfsmaður er innskráður á verk.
// OS keyrir verkið líka í bakgrunni (og með appið lokað á iOS með Always-heimild)
// — punktarnir fara í log_location og birtast á korti stjórnenda.
// Vöktun stoppar sjálfkrafa við útskráningu (handvirka, sjálfvirka og geofence).
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { supabase } from "./supabase";

export const TRACKING_TASK = "timaverk-location-tracking";

interface TrackingData {
  locations: Location.LocationObject[];
}

TaskManager.defineTask(TRACKING_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data ?? {}) as TrackingData;
  const loc = locations?.[locations.length - 1];
  if (!loc) return;

  try {
    const { data: active } = await supabase
      .from("v_my_active_entry")
      .select("id")
      .maybeSingle();
    if (!active?.id) {
      // Engin virk skráning — hætta vöktun (öryggisnet)
      await stopTracking();
      return;
    }
    await supabase.rpc("log_location", {
      p_time_entry_id: active.id,
      p_lat: loc.coords.latitude,
      p_lng: loc.coords.longitude,
      p_accuracy: loc.coords.accuracy ?? null,
    });
  } catch {
    // Þögult í bakgrunni — næsti punktur reynir aftur
  }
});

export async function startTracking(): Promise<void> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(
      TRACKING_TASK
    ).catch(() => false);
    if (started) return;
    await Location.startLocationUpdatesAsync(TRACKING_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 60_000,      // ~1 mín milli punkta
      distanceInterval: 50,      // eða 50 m hreyfing
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Tímaverk",
        notificationBody: "Tímaskráning í gangi — staðsetning virk",
      },
    });
  } catch {
    // Heimild vantar — forgrunnsvöktun virka skjásins dugar samt
  }
}

export async function stopTracking(): Promise<void> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(
      TRACKING_TASK
    ).catch(() => false);
    if (started) await Location.stopLocationUpdatesAsync(TRACKING_TASK);
  } catch {
    // ekkert að stöðva
  }
}
