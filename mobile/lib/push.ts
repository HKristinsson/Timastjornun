// Push-tilkynningar: skráir Expo-push-token tækisins í gagnagrunninn.
// Bakendinn (trigger í Postgres) sendir síðan push í gegnum Expo þegar
// nýtt skeyti eða tilkynning berst — líka þegar appið er lokað.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

// EAS project ID (sama og í app.json extra.eas.projectId)
const PROJECT_ID = "cb85e512-e526-4baa-b296-38162af185e4";

// Tilkynningar birtast líka þegar appið er opið (borði efst).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let registered = false;

export async function registerPush(): Promise<void> {
  if (registered) return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Skilaboð",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
      });
    }

    const token = (
      await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID })
    ).data;
    if (!token) return;

    await supabase.rpc("push_register", {
      p_token: token,
      p_platform: Platform.OS,
    });
    registered = true;
  } catch {
    // Push óvirkt (t.d. hermir eða heimild hafnað) — appið virkar áfram.
  }
}
