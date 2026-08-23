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

export class GeofenceError extends Error {
  code: string;
  distance?: number;
  accuracy?: number;

  constructor(message: string, code: string, distance?: number, accuracy?: number) {
    super(message);
    this.name = 'GeofenceError';
    this.code = code;
    this.distance = distance;
    this.accuracy = accuracy;
  }
}

// ── K.R. Mangalam University, Sohna Road, Gurugram ────────────────────────────
// Verified coordinates: 28.272428°N, 77.0675693°E
// Source: Google AI Overview + official krmangalam.edu.in documents (A-Block / campus centroid)
export const CAMPUS_CENTER = {
  lat: Number(import.meta.env.VITE_CAMPUS_LAT) || 28.272428,
  lng: Number(import.meta.env.VITE_CAMPUS_LNG) || 77.0675693,
};

export const CAMPUS_RADIUS_METERS = Number(import.meta.env.VITE_CAMPUS_RADIUS_METERS) || 300; // Full campus footprint (~300m radius from centroid)
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
        maximumAge: 0, // Force a fresh GPS reading
      },
    );
  });
}

/**
 * Pre-check: get location and verify GPS accuracy is acceptable.
 * Returns coordinates, throws with friendly message if unable to get good accuracy.
 */
export async function acquireLocation(): Promise<GeolocationResult> {
  const position = await getCurrentPosition();
  
  if (position.accuracy > 100) {
    throw new GeofenceError(
      `Your GPS accuracy is too low (${Math.round(position.accuracy)}m). ` +
      `Please move to an open area or connect to Wi-Fi for better location accuracy.`,
      'GEOFENCE_POOR_ACCURACY',
      0,
      position.accuracy
    );
  }

  return position;
}
