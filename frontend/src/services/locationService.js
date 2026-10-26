/**
 * RESQMesh — Location & Shareable Map Link Service
 *
 * Handles browser Geolocation, persistent IndexedDB location history,
 * automatic location-link generation, and strict distinction between
 * CURRENT and LAST_KNOWN GPS fixes. Zero internet required for link generation.
 */

import { saveLocationFix, getLastKnownLocationFix } from './offlineStorage';

/**
 * Generates standard shareable map link from latitude and longitude.
 * Requires zero internet to generate or transmit.
 * Format: https://www.google.com/maps?q=LATITUDE,LONGITUDE
 */
export function generateLocationLink(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return null;
  }
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (isNaN(latNum) || isNaN(lngNum)) return null;

  return `https://www.google.com/maps?q=${latNum.toFixed(6)},${lngNum.toFixed(6)}`;
}

/**
 * Builds structured location object matching CASCADE '26 specifications.
 */
export function buildLocationObject(arg1 = {}, ...rest) {
  let latitude, longitude, accuracy_meters, timestamp, saved_at, source, referenceTime;

  if (typeof arg1 === 'number') {
    latitude = arg1;
    longitude = rest[0] ?? null;
    accuracy_meters = rest[1] ?? 15;
    const isFresh = rest[2] ?? true;
    source = isFresh ? 'CURRENT' : 'LAST_KNOWN';
    timestamp = new Date().toISOString();
  } else {
    latitude = arg1.latitude ?? arg1.lat ?? null;
    longitude = arg1.longitude ?? arg1.lng ?? null;
    accuracy_meters = arg1.accuracy_meters ?? arg1.accuracy ?? null;
    timestamp = arg1.timestamp ?? arg1.measured_at ?? null;
    saved_at = arg1.saved_at ?? null;
    source = arg1.source ?? (arg1.is_fresh ? 'CURRENT' : (arg1.isLastKnown ? 'LAST_KNOWN' : 'CURRENT'));
    referenceTime = arg1.referenceTime ?? Date.now();
  }
  if (latitude === null || longitude === null) {
    return {
      location_link: null,
      latitude: null,
      longitude: null,
      location_source: 'UNAVAILABLE',
      location_timestamp: null,
      measured_at: null,
      saved_at: null,
      location_age_seconds: null,
      accuracy_meters: null,
      is_fresh: false
    };
  }

  const lat = Number(Number(latitude).toFixed(6));
  const lng = Number(Number(longitude).toFixed(6));
  const link = generateLocationLink(lat, lng);
  const fixIso = timestamp ? new Date(timestamp).toISOString() : new Date(referenceTime).toISOString();
  const fixMs = new Date(fixIso).getTime();
  const ageSeconds = Math.max(0, Math.round((referenceTime - fixMs) / 1000));
  const isFresh = source === 'CURRENT';

  return {
    location_link: link,
    latitude: lat,
    longitude: lng,
    location_source: source, // 'CURRENT' | 'LAST_KNOWN'
    location_timestamp: fixIso,
    measured_at: fixIso,
    saved_at: saved_at || new Date().toISOString(),
    location_age_seconds: isFresh ? 0 : ageSeconds,
    accuracy_meters: accuracy_meters !== null ? Math.round(accuracy_meters) : 15,
    is_fresh: isFresh
  };
}

/**
 * Attempts to obtain fresh GPS fix via Geolocation API with timeout.
 * @param {number} timeoutMs Maximum wait time for fresh fix (default 4000ms)
 */
export function getFreshGpsLocation(timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation API not supported'));
      return;
    }

    const timer = setTimeout(() => {
      reject(new Error('Geolocation request timed out'));
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_meters: pos.coords.accuracy,
          timestamp: new Date(pos.timestamp || Date.now()).toISOString()
        });
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 5000
      }
    );
  });
}

/**
 * Retrieves the current GPS fix if available, or seamlessly falls back to
 * the most recent locally saved fix from IndexedDB marked as LAST_KNOWN.
 *
 * Workflow:
 * 1. Attempt fresh GPS location.
 * 2. On success: save to IndexedDB and return with source 'CURRENT'.
 * 3. On failure: retrieve most recent fix from IndexedDB, compute age, mark as 'LAST_KNOWN'.
 * 4. If no fix ever saved: return null coordinates allowing landmark description fallback.
 */
export async function getCurrentOrLastKnownLocation(timeoutMs = 3500) {
  // Step 1: Try fresh GPS
  try {
    const fresh = await getFreshGpsLocation(timeoutMs);
    // Persist to local IndexedDB location history
    await saveLocationFix(fresh);

    return buildLocationObject({
      latitude: fresh.latitude,
      longitude: fresh.longitude,
      accuracy_meters: fresh.accuracy_meters,
      timestamp: fresh.timestamp,
      source: 'CURRENT'
    });
  } catch (err) {
    // Step 2 & 3: Fall back to most recent locally stored fix
    console.warn('Fresh GPS acquisition unavailable, falling back to local IndexedDB history:', err.message);
    const lastKnown = await getLastKnownLocationFix();

    if (lastKnown && lastKnown.latitude !== undefined && lastKnown.longitude !== undefined) {
      return buildLocationObject({
        latitude: lastKnown.latitude,
        longitude: lastKnown.longitude,
        accuracy_meters: lastKnown.accuracy_meters,
        timestamp: lastKnown.timestamp,
        source: 'LAST_KNOWN'
      });
    }

    // Step 4: No location ever recorded
    return buildLocationObject({
      latitude: null,
      longitude: null,
      source: null
    });
  }
}

/**
 * Formats location age for human readability strictly according to specifications:
 * - "Location updated 20 seconds ago" (or "Location updated just now")
 * - "Last location traced 8 minutes ago"
 * - "Last location traced 2 hours ago"
 * Accepts either age in seconds or a timestamp.
 */
export function formatLocationAge(input) {
  if (input === null || input === undefined) return '';

  let ageSeconds = 0;
  if (typeof input === 'number') {
    if (input > 100000000000) {
      // Millisecond epoch timestamp (e.g. Date.now() - 45000)
      ageSeconds = Math.max(0, Math.round((Date.now() - input) / 1000));
    } else if (input > 1000000000) {
      // Second epoch timestamp
      ageSeconds = Math.max(0, Math.round(Date.now() / 1000 - input));
    } else {
      // Direct elapsed seconds
      ageSeconds = Math.max(0, input);
    }
  } else {
    const timeMs = new Date(input).getTime();
    if (isNaN(timeMs)) return '';
    ageSeconds = Math.max(0, Math.round((Date.now() - timeMs) / 1000));
  }

  if (ageSeconds < 10) {
    return 'Location updated just now';
  }
  if (ageSeconds < 60) {
    return `Location updated ${ageSeconds} seconds ago`;
  }

  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) {
    return `Last location traced ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Last location traced ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  return `Last location traced ${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Returns standardized freshness classification for UI display:
 * 'Current GPS location' | 'Last known location' | 'Location unavailable'
 */
export function getLocationFreshnessLabel(loc) {
  if (!loc || loc.latitude == null || loc.longitude == null) {
    return {
      status: 'UNAVAILABLE',
      label: 'Location unavailable',
      ageText: 'GPS fix required',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300'
    };
  }

  if (loc.is_fresh || loc.location_source === 'CURRENT') {
    return {
      status: 'CURRENT',
      label: 'Current GPS location',
      ageText: 'Live satellite fix',
      accuracyText: loc.accuracy_meters ? `Accuracy: ±${loc.accuracy_meters} m` : 'Accuracy: ±15 m',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300'
    };
  }

  const age = loc.location_age_seconds != null ? loc.location_age_seconds : loc.measured_at || loc.timestamp;
  const ageFormatted = formatLocationAge(age);

  return {
    status: 'LAST_KNOWN',
    label: 'Last known location',
    ageText: ageFormatted,
    accuracyText: loc.accuracy_meters ? `Accuracy: ±${loc.accuracy_meters} m` : 'Accuracy: ±25 m',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300'
  };
}

/**
 * Copies location link to clipboard.
 */
export async function copyLocationLinkToClipboard(link) {
  if (!link) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(link);
      return true;
    }
    // Fallback
    const textArea = document.createElement('textarea');
    textArea.value = link;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return true;
  } catch (e) {
    console.error('Failed to copy location link:', e);
    return false;
  }
}
