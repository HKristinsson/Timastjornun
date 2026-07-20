"use client";

// Lifandi staðsetning innskráðra starfsmanna á korti.
// Aðeins sýnileg innan tímaglugga félagsins (Stillingar) — bakendinn
// framfylgir glugganum, viðmótið sýnir skilaboð utan hans.
import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createClient } from "@/lib/supabase/client";
import { OSM_STYLE, DEFAULT_CENTER, circlePolygon } from "@/lib/geo";

interface EmployeeLocation {
  employee_id: string;
  full_name: string;
  photo_path: string | null;
  project_no: string;
  project_name: string;
  lat: number;
  lng: number;
  recorded_at: string;
  inside_geofence: boolean | null;
  minutes_ago: number;
}

interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  active: boolean;
}

const REFRESH_MS = 60_000;

export default function StaffMapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [locations, setLocations] = useState<EmployeeLocation[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("employee_locations");
    setLoading(false);
    if (error) {
      if (error.message.includes("TRACKING_CLOSED")) {
        setClosed(true);
        setLocations([]);
      } else {
        setError(error.message);
      }
      return;
    }
    setClosed(false);
    setError(null);
    const list = (data ?? []) as EmployeeLocation[];
    setLocations(list);
    setUpdatedAt(new Date());

    // Skoðunarslóðir starfsmannamynda fyrir sprettiglugga
    const supabase = createClient();
    const urls: Record<string, string> = {};
    await Promise.all(
      list
        .filter((l) => l.photo_path)
        .map(async (l) => {
          const { data: signed } = await supabase.storage
            .from("employee-photos")
            .createSignedUrl(l.photo_path as string, 3600);
          if (signed?.signedUrl) urls[l.employee_id] = signed.signedUrl;
        })
    );
    setPhotoUrls((prev) => ({ ...prev, ...urls }));
  }, []);

  // Sækja reglulega
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // Kort + staðir félagsins (teiknaðir einu sinni)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE as maplibregl.StyleSpecification,
      center: DEFAULT_CENTER,
      zoom: 10,
    });
    mapRef.current = map;

    map.on("load", async () => {
      const { data } = await createClient()
        .from("v_places")
        .select("id, name, lat, lng, radius_m, active")
        .eq("active", true);
      const places = (data ?? []) as Place[];
      if (places.length > 0) {
        map.addSource("places", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: places.map((p) => circlePolygon(p.lng, p.lat, p.radius_m)),
          } as GeoJSON.FeatureCollection,
        });
        map.addLayer({
          id: "places-fill",
          type: "fill",
          source: "places",
          paint: { "fill-color": "#f59e0b", "fill-opacity": 0.12 },
        });
        map.addLayer({
          id: "places-line",
          type: "line",
          source: "places",
          paint: { "line-color": "#f59e0b", "line-width": 1.5 },
        });
        places.forEach((p) => {
          new maplibregl.Marker({ color: "#f59e0b", scale: 0.8 })
            .setLngLat([p.lng, p.lat])
            .setPopup(new maplibregl.Popup().setText(`📍 ${p.name}`))
            .addTo(map);
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Starfsmanna-merki uppfærð við hverja sókn
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (locations.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    locations.forEach((l) => {
      const el = document.createElement("div");
      el.style.cssText =
        "width:34px;height:34px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer";
      el.textContent = l.full_name
        .split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([l.lng, l.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 20 }).setHTML(
            (photoUrls[l.employee_id]
              ? `<img src="${photoUrls[l.employee_id]}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:12px;margin-bottom:6px;display:block"/>`
              : "") +
              `<strong>${l.full_name}</strong><br/>${l.project_no} ${l.project_name}<br/>` +
              `<small>Fyrir ${l.minutes_ago} mín${
                l.inside_geofence === false ? " · ⚠ utan svæðis" : ""
              }</small>`
          )
        )
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([l.lng, l.lat]);
    });
    if (locations.length > 0) {
      map.fitBounds(bounds, { padding: 80, maxZoom: 14 });
    }
  }, [locations, photoUrls]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Staðsetning starfsmanna</h1>
        {updatedAt && !closed && (
          <span className="text-xs text-slate-400">
            Uppfært kl.{" "}
            {updatedAt.toLocaleTimeString("is-IS", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · uppfærist sjálfkrafa
          </span>
        )}
      </div>

      {closed && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Utan tímaglugga.</strong> Staðsetning starfsmanna er aðeins
          sýnileg innan þess tíma sem er stilltur undir{" "}
          <a href="/dashboard/settings" className="underline">
            Stillingar
          </a>{" "}
          (sjálfgefið 08:00–16:00 virka daga).
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {!closed && !loading && locations.length === 0 && !error && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Enginn starfsmaður er innskráður á verk með staðsetningu núna.
        </div>
      )}

      <div
        ref={containerRef}
        className="h-[520px] w-full overflow-hidden rounded-xl border border-slate-200"
      />

      {locations.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/60">
          {locations.map((l, i) => (
            <div
              key={l.employee_id}
              className={`flex items-center gap-3 px-4 py-3 text-sm ${
                i > 0 ? "border-t border-slate-100" : ""
              }`}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {l.full_name
                  .split(" ")
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-800">
                  {l.full_name}
                </span>
                <span className="block truncate text-xs text-slate-400">
                  {l.project_no} {l.project_name}
                </span>
              </span>
              <span
                className={`text-xs ${
                  l.inside_geofence === false ? "text-amber-600" : "text-slate-400"
                }`}
              >
                {l.inside_geofence === false ? "⚠ Utan svæðis · " : ""}
                fyrir {l.minutes_ago} mín
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
