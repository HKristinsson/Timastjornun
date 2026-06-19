"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { OSM_STYLE, DEFAULT_CENTER, circlePolygon } from "@/lib/geo";

export interface MapProject {
  id: string;
  name: string;
  project_no: string;
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
}

// Kort sem sýnir öll verkefni með geofence-svæði.
export default function ProjectsOverviewMap({ projects }: { projects: MapProject[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const withCoords = projects
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({
        id: p.id,
        name: p.name,
        project_no: p.project_no,
        lng: p.lng as number,
        lat: p.lat as number,
        radius_m: p.radius_m ?? 100,
      }));

    const center: [number, number] = withCoords[0]
      ? [withCoords[0].lng, withCoords[0].lat]
      : DEFAULT_CENTER;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE as maplibregl.StyleSpecification,
      center,
      zoom: 11,
    });
    mapRef.current = map;

    map.on("load", () => {
      const features = withCoords.map((p) =>
        circlePolygon(p.lng, p.lat, p.radius_m ?? 100)
      );
      map.addSource("areas", {
        type: "geojson",
        data: { type: "FeatureCollection", features } as GeoJSON.FeatureCollection,
      });
      map.addLayer({
        id: "areas-fill",
        type: "fill",
        source: "areas",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "areas-line",
        type: "line",
        source: "areas",
        paint: { "line-color": "#2563eb", "line-width": 2 },
      });

      const bounds = new maplibregl.LngLatBounds();
      withCoords.forEach((p) => {
        new maplibregl.Marker({ color: "#1e40af" })
          .setLngLat([p.lng, p.lat])
          .setPopup(
            new maplibregl.Popup().setText(`${p.project_no} – ${p.name}`)
          )
          .addTo(map);
        bounds.extend([p.lng, p.lat]);
      });
      if (withCoords.length > 1) map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-[480px] w-full overflow-hidden rounded-xl border border-slate-200"
    />
  );
}
