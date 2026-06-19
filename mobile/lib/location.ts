import * as Location from "expo-location";

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number | null;
}

// Biðja um foreground-heimild (við check-in). Background fæst sér í onboarding.
export async function ensureForegroundPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export async function ensureBackgroundPermission(): Promise<boolean> {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  return status === "granted";
}

// Sækja núverandi staðsetningu með góðri nákvæmni.
export async function getCurrentFix(): Promise<Fix> {
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
  };
}

// Haversine fjarlægð í metrum (til að sýna fjarlægð í verkefnavali).
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6378137;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
