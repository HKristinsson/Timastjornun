"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { OSM_STYLE, DEFAULT_CENTER, circleCollection } from "@/lib/geo";

interface Props {
  initialLat?: number | null;
  initialLng?: number | null;
  initialRadius?: number;
  initialAddress?: string;
}

// Kortaval fyrir verkefnisstaðsetningu: draganlegur pinni + radíus.
// Skrifar gildi í falin form-input (lat/lng/radius_m) svo server action lesi þau.
export default function MapPicker({
  initialLat,
  initialLng,
  initialRadius = 100,
  initialAddress = "",
}: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const startLng = initialLng ?? DEFAULT_CENTER[0];
  const startLat = initialLat ?? DEFAULT_CENTER[1];

  const [lat, setLat] = useState(startLat);
  const [lng, setLng] = useState(startLng);
  const [radius, setRadius] = useState(initialRadius);
  const [address, setAddress] = useState(initialAddress);
  const [geocoding, setGeocoding] = useState(false);

  // Teikna/uppfæra geofence-hringinn
  function drawCircle(map: maplibregl.Map, lng: number, lat: number, r: number) {
    const data = circleCollection(lng, lat, r);
    const src = map.getSource("geofence") as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(data as GeoJSON.FeatureCollection);
    } else {
      map.addSource("geofence", { type: "geojson", data: data as GeoJSON.FeatureCollection });
      map.addLayer({
        id: "geofence-fill",
        type: "fill",
        source: "geofence",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: "geofence-line",
        type: "line",
        source: "geofence",
        paint: { "line-color": "#2563eb", "line-width": 2 },
      });
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE as maplibregl.StyleSpecification,
      center: [startLng, startLat],
      zoom: 15,
    });
    mapRef.current = map;

    const marker = new maplibregl.Marker({ draggable: true, color: "#2563eb" })
      .setLngLat([startLng, startLat])
      .addTo(map);
    markerRef.current = marker;

    map.on("load", () => drawCircle(map, startLng, startLat, radius));

    marker.on("dragend", () => {
      const p = marker.getLngLat();
      setLng(p.lng);
      setLat(p.lat);
      drawCircle(map, p.lng, p.lat, radius);
    });

    map.on("click", (e) => {
      marker.setLngLat(e.lngLat);
      setLng(e.lngLat.lng);
      setLat(e.lngLat.lat);
      drawCircle(map, e.lngLat.lng, e.lngLat.lat, radius);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Uppfæra hring þegar radíus breytist
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) drawCircle(map, lng, lat, radius);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius]);

  // Sækja hnit út frá heimilisfangi (Nominatim/OSM)
  async function geocode() {
    if (!address.trim()) return;
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
        address
      )}`;
      const res = await fetch(url, { headers: { "Accept-Language": "is" } });
      const json = (await res.json()) as { lat: string; lon: string }[];
      if (json[0]) {
        const newLat = parseFloat(json[0].lat);
        const newLng = parseFloat(json[0].lon);
        setLat(newLat);
        setLng(newLng);
        const map = mapRef.current;
        if (map) {
          map.flyTo({ center: [newLng, newLat], zoom: 16 });
          markerRef.current?.setLngLat([newLng, newLat]);
          drawCircle(map, newLng, newLat, radius);
        }
      }
    } finally {
      setGeocoding(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <input
          name="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Heimilisfang"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={geocode}
          disabled={geocoding}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {geocoding ? "Leita…" : "Sækja hnit"}
        </button>
      </div>

      <div
        ref={containerRef}
        className="h-72 w-full overflow-hidden rounded-lg border border-slate-200"
      />

      <div className="mt-3 flex items-center gap-3">
        <label className="text-sm font-medium">Radíus: {radius} m</label>
        <input
          type="range"
          min={50}
          max={300}
          step={10}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Smelltu á kortið eða dragðu pinnann til að velja staðsetningu.
        Hnit: {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>

      {/* Falin gildi sem form action les */}
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />
      <input type="hidden" name="radius_m" value={radius} />
    </div>
  );
}
