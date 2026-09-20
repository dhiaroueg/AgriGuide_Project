export type LatLng = [number, number];

const KEY = "agriguide.terrain";

export function saveTerrain(points: LatLng[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(points));
  } catch {
    // ignore
  }
}

export function loadTerrain(): LatLng[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as LatLng[];
    return [];
  } catch {
    return [];
  }
}

/**
 * Compute the area of a polygon on the Earth's surface using the spherical excess formula.
 * Returns square meters.
 */
export function polygonAreaM2(points?: LatLng[] | null): number {
  if (!points || points.length < 3) return 0;
  const R = 6378137; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const [lat1, lon1] = points[i];
    const [lat2, lon2] = points[(i + 1) % points.length];
    total +=
      toRad(lon2 - lon1) *
      (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs((total * R * R) / 2);
}

export function areaHectares(points?: LatLng[] | null): number {
  if (!points) return 0;
  return polygonAreaM2(points) / 10000;
}

export function centroid(points?: LatLng[] | null): LatLng | null {
  if (!points || !points.length) return null;
  const sum = points.reduce(
    (acc, [lat, lon]) => [acc[0] + lat, acc[1] + lon] as LatLng,
    [0, 0] as LatLng,
  );
  return [sum[0] / points.length, sum[1] / points.length];
}