// Landfræðileg hjálparföll fyrir kort (MapLibre/GeoJSON).

import type { FeatureCollection, Feature, Polygon } from "geojson";

// MapLibre raster-stíll byggður á OpenStreetMap flísum (ókeypis, dev-vænt).
export const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

// Reykjavík sem sjálfgefin miðja
export const DEFAULT_CENTER: [number, number] = [-21.9426, 64.1466];

// Búa til hringlaga GeoJSON-polygon (geofence) kringum punkt.
export function circlePolygon(
  lng: number,
  lat: number,
  radiusM: number,
  points = 64
): Feature<Polygon> {
  const coords: [number, number][] = [];
  const earth = 6378137; // radíus jarðar í metrum
  const dLat = (radiusM / earth) * (180 / Math.PI);
  const dLng =
    (radiusM / (earth * Math.cos((Math.PI * lat) / 180))) * (180 / Math.PI);

  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: {},
  };
}

export function circleCollection(
  lng: number,
  lat: number,
  radiusM: number
): FeatureCollection {
  return { type: "FeatureCollection", features: [circlePolygon(lng, lat, radiusM)] };
}
