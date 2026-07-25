export interface GeoPoint {
  type: "Point";
  /** GeoJSON uses longitude first, then latitude. */
  coordinates: [number, number];
}

/** Return a MongoDB-compatible WGS84 point, or null for unusable coordinates. */
export function geoPoint(lat: unknown, lng: unknown): GeoPoint | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { type: "Point", coordinates: [lng, lat] };
}
