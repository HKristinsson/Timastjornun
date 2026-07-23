// Samfelld staðsetningarskráning á VINNUTÍMA — bæði meðan innskráður á verk
// (log_location, tengt tímaskráningunni) og utan verk-innskráningar
// (presence_ping — bakendinn geymir AÐEINS innan tímaglugga félagsins og
// aðeins síðustu stöðu; utan glugga er engu safnað). OS keyrir verkið líka
// í bakgrunni og með appið lokað (Always-heimild).
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { supabase } from "./supabase";

// v2: hærri nákvæmni + þéttari punktar svo ferðir milli staða sjáist á korti.
// (Nýtt verk-heiti svo eldri uppsetningar skipti sjálfkrafa yfir í nýju stillingarnar.)
export const TRACKING_TASK = "timaverk-location-tracking-v2";
const LEGACY_TASK = "timaverk-location-tracking";

interface TrackingData {
  locations: Location.LocationObject[];
}

TaskManager.defineTask(TRACKING_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data ?? {}) as TrackingData;
  const loc = locations?.[locations.length - 1];
  if (!loc) return;

  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      // Útskráð(ur) úr appinu — hætta vöktun
      await stopTracking();
      return;
    }
    const { data: active } = await supabase
      .from("v_my_active_entry")
      .select("id")
      .maybeSingle();
    if (active?.id) {
      // Innskráð(ur) á verk: punktur á tímaskráninguna (geofence + heimsóknir)
      await supabase.rpc("log_location", {
        p_time_entry_id: active.id,
        p_lat: loc.coords.latitude,
        p_lng: loc.coords.longitude,
        p_accuracy: loc.coords.accuracy ?? null,
      });
    } else {
      // Í vinnu en ekki á verki: viðveru-púls (server sér um tímagluggann)
      await supabase.rpc("presence_ping", {
        p_lat: loc.coords.latitude,
        p_lng: loc.coords.longitude,
        p_accuracy: loc.coords.accuracy ?? null,
      });
    }
  } catch {
    // Þögult í bakgrunni — næsti punktur reynir aftur
  }
});

export async function startTracking(): Promise<void> {
  try {
    // Stöðva gamla verkið (v1) ef það er enn í gangi frá eldri uppsetningu
    const legacy = await Location.hasStartedLocationUpdatesAsync(LEGACY_TASK).catch(
      () => false
    );
    if (legacy) await Location.stopLocationUpdatesAsync(LEGACY_TASK).catch(() => {});

    const started = await Location.hasStartedLocationUpdatesAsync(
      TRACKING_TASK
    ).catch(() => false);
    if (started) return;
    await Location.startLocationUpdatesAsync(TRACKING_TASK, {
      // Há nákvæmni + punktur á ~25 m fresti á ferð svo leiðin teiknist á korti.
      // Kyrrstaða skilar engum punktum (sparar rafhlöðu) — bakendinn brúar
      // bilið og reiknar viðverutímann á staðnum út frá komu- og brottfararpunktum.
      accuracy: Location.Accuracy.High,
      timeInterval: 30_000,      // Android: að hámarki 30 sek milli punkta
      distanceInterval: 25,      // punktur við 25 m hreyfingu
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Tímaverk",
        notificationBody: "Vinnutími — staðsetning virk",
      },
    });
  } catch {
    // Heimild vantar — forgrunnsvöktun virka skjásins dugar samt
  }
}

export async function stopTracking(): Promise<void> {
  try {
    for (const task of [TRACKING_TASK, LEGACY_TASK]) {
      const started = await Location.hasStartedLocationUpdatesAsync(task).catch(
        () => false
      );
      if (started) await Location.stopLocationUpdatesAsync(task).catch(() => {});
    }
  } catch {
    // ekkert að stöðva
  }
}
