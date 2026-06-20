// Staðsetning í vafra (Geolocation API) — fyrir starfsmanna-vefappið.

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number | null;
}

export function getCurrentFix(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Staðsetning er ekki studd í þessum vafra."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        }),
      (err) => reject(new Error(geoErr(err))),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

function geoErr(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED)
    return "Staðsetningarheimild var hafnað. Leyfðu staðsetningu og reyndu aftur.";
  if (err.code === err.POSITION_UNAVAILABLE) return "Staðsetning fékkst ekki.";
  if (err.code === err.TIMEOUT) return "Tímamörk runnu út við að sækja staðsetningu.";
  return "Villa við að sækja staðsetningu.";
}

// Haversine fjarlægð í metrum
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

export function translateRpcError(msg: string): string {
  if (msg.includes("OUTSIDE_AREA")) return "Þú ert utan svæðis verkefnisins.";
  if (msg.includes("LOW_ACCURACY")) return "GPS-nákvæmni er ófullnægjandi. Reyndu aftur.";
  if (msg.includes("ALREADY_ACTIVE")) return "Þú ert þegar með virka skráningu.";
  if (msg.includes("NOT_ASSIGNED")) return "Þú hefur ekki aðgang að þessu verkefni.";
  if (msg.includes("NO_GEOFENCE")) return "Verkefnið hefur ekkert skilgreint svæði.";
  return msg;
}
