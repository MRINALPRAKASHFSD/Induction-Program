/**
 * src/lib/geofence.ts
 *
 * Client-side geolocation and geofence utilities.
 *
 * Used by the student attendance scanner to:
 *   1. Request GPS permission
 *   2. Capture current coordinates
 *   3. Pre-check if inside campus (friendly error before server call)
 *
 * The server ALWAYS re-validates coordinates — never trust client alone.
 */

// ── K.R. Mangalam University, Sohna Road, Gurugram ────────────────────────────
// Verified coordinates: 28.2712°N, 77.0679°E (main campus, near A-Block/main gate)
export const CAMPUS_CENTER = {
  lat: 28.2712,
  lng: 77.0679,
};

export const CAMPUS_RADIUS_METERS = 250;
export const GPS_TOLERANCE_METERS = 40; // ±40m for indoor/cloudy/Android GPS drift

// ── Haversine distance ────────────────────────────────────────────────────────
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Check if inside campus ────────────────────────────────────────────────────
export function isInsideCampus(
  lat: number,
  lng: number,
  center = CAMPUS_CENTER,
  radiusMeters = CAMPUS_RADIUS_METERS,
): { inside: boolean; distance: number } {
  const distance = haversineDistance(lat, lng, center.lat, center.lng);
  return {
    inside: distance <= radiusMeters + GPS_TOLERANCE_METERS,
    distance: Math.round(distance),
  };
}

// ── Get current position ──────────────────────────────────────────────────────
export interface GeolocationResult {
  lat: number;
  lng: number;
  accuracy: number;
}

export function getCurrentPosition(
  timeoutMs = 10000,
  highAccuracy = true,
): Promise<GeolocationResult> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported by your browser. Please use a modern mobile browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('Location permission denied. Please enable GPS in your browser settings to mark attendance.'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error('Unable to determine your location. Please check your GPS settings.'));
            break;
          case error.TIMEOUT:
            reject(new Error('Location request timed out. Please try again in an open area.'));
            break;
          default:
            reject(new Error('Failed to get your location. Please enable GPS and try again.'));
        }
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: timeoutMs,
        maximumAge: 30000, // Accept cached position up to 30s old
      },
    );
  });
}

/**
 * Pre-check: get location and verify student is inside campus.
 * Returns coordinates if inside, throws with friendly message if outside.
 */
export async function verifyInsideCampus(): Promise<GeolocationResult> {
  const position = await getCurrentPosition();
  const { inside, distance } = isInsideCampus(position.lat, position.lng);

  if (!inside) {
    throw new Error(
      `You must be inside the K.R. Mangalam University campus to mark attendance. ` +
      `You appear to be approximately ${distance}m from campus.`,
    );
  }

  return position;
}
