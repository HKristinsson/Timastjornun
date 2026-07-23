import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";
import { startTracking } from "./tracking";

// Nafn bakgrunnsverksins. Stýrikerfið vekur þetta þegar farið er yfir
// svæðismörk — LÍKA þegar appið er lokað eða í bakgrunni (OS-geofencing).
export const GEOFENCE_TASK = "timastjornun-geofence";

interface GeofenceData {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) return;
  const { eventType } = (data ?? {}) as GeofenceData;

  // Okkur er aðeins annt um þegar starfsmaður FER ÚT af svæði.
  if (eventType !== Location.GeofencingEventType.Exit) return;

  try {
    // Finna virka skráningu núverandi notanda (session endurheimt úr AsyncStorage).
    const { data: active } = await supabase
      .from("v_my_active_entry")
      .select("id, project_name")
      .maybeSingle();

    if (!active?.id) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
      return;
    }

    // Sjálfvirk útskráning server-side (merkt auto_geofence, bíður samþykktar).
    await supabase.rpc("auto_check_out", {
      p_time_entry_id: active.id,
      p_reason: "auto_geofence",
    });

    await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
    // Tryggja að ferða-vöktunin sé í gangi svo leiðin af staðnum sjáist á korti
    await startTracking();

    // Láta starfsmann vita (staðbundin tilkynning — virkar í bakgrunni).
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Sjálfvirk útskráning",
        body: `Þú fórst af svæði ${active.project_name ?? "verkefnis"} og varst skráð(ur) út.`,
      },
      trigger: null,
    });
  } catch {
    // Þögult í bakgrunni — reynt aftur við næsta atburð.
  }
});

// Hefja svæðisvöktun fyrir tiltekið verkefni (kallað við check-in).
export async function startProjectGeofence(
  projectId: string,
  latitude: number,
  longitude: number,
  radius: number
): Promise<void> {
  const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(
    () => false
  );
  if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});

  await Location.startGeofencingAsync(GEOFENCE_TASK, [
    {
      identifier: projectId,
      latitude,
      longitude,
      radius,
      notifyOnEnter: false,
      notifyOnExit: true,
    },
  ]);
}

// Stöðva svæðisvöktun (kallað við handvirka útskráningu).
export async function stopProjectGeofence(): Promise<void> {
  const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(
    () => false
  );
  if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
}
