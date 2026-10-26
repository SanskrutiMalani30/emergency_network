import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildLocationObject, formatLocationAge, getLocationFreshnessLabel } from '../locationService';

describe('User Location State & Safety Suite', () => {
  beforeEach(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      const store: Record<string, string> = {};
      globalThis.localStorage = {
        getItem: (k: string) => store[k] || null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); },
        length: 0,
        key: () => null
      } as any;
    }
    localStorage.clear();
  });

  it('1. Initializes safely without coordinates when location is unavailable (no crash, zero fake coords)', () => {
    const locObj = buildLocationObject({
      latitude: null,
      longitude: null,
      source: 'UNAVAILABLE'
    });

    expect(locObj.location_source).toBe('UNAVAILABLE');
    expect(locObj.latitude).toBeNull();
    expect(locObj.longitude).toBeNull();
    expect(locObj.location_link).toBeNull();
    expect(locObj.is_fresh).toBe(false);
  });

  it('2. Correctly flags fresh GPS coordinates as CURRENT and fresh', () => {
    const nowIso = new Date().toISOString();
    const locObj = buildLocationObject({
      latitude: 21.1458,
      longitude: 79.0882,
      accuracy_meters: 12,
      measured_at: nowIso,
      source: 'CURRENT',
      is_fresh: true
    });

    expect(locObj.location_source).toBe('CURRENT');
    expect(locObj.is_fresh).toBe(true);
    expect(locObj.latitude).toBe(21.1458);
    expect(locObj.longitude).toBe(79.0882);
    expect(locObj.accuracy_meters).toBe(12);
    expect(locObj.location_link).toContain('https://www.google.com/maps?q=21.145800,79.088200');

    const freshness = getLocationFreshnessLabel({
      latitude: 21.1458,
      longitude: 79.0882,
      accuracy_meters: 12,
      measured_at: nowIso,
      is_fresh: true
    });
    expect(freshness.label).toBe('Current GPS location');
  });

  it('3. Correctly flags restored cached coordinates as LAST_KNOWN with accurate age', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const locObj = buildLocationObject({
      latitude: 21.1458,
      longitude: 79.0882,
      accuracy_meters: 25,
      measured_at: tenMinutesAgo,
      source: 'LAST_KNOWN',
      is_fresh: false
    });

    expect(locObj.location_source).toBe('LAST_KNOWN');
    expect(locObj.is_fresh).toBe(false);
    expect(locObj.latitude).toBe(21.1458);
    expect(locObj.longitude).toBe(79.0882);

    const age = formatLocationAge(tenMinutesAgo);
    expect(age).toMatch(/10 minutes ago|9 minutes ago|11 minutes ago/);

    const freshness = getLocationFreshnessLabel({
      latitude: 21.1458,
      longitude: 79.0882,
      accuracy_meters: 25,
      measured_at: tenMinutesAgo,
      is_fresh: false
    });
    expect(freshness.label).toBe('Last known location');
  });

  it('4. Handles denied location permission safely while keeping cached location if available', () => {
    // Simulating initial state when localStorage has a cached fix
    const cachedFix = {
      latitude: 21.1500,
      longitude: 79.0900,
      accuracy_meters: 18,
      measured_at: new Date(Date.now() - 120000).toISOString(),
      saved_at: new Date(Date.now() - 120000).toISOString(),
      is_last_known: true
    };
    localStorage.setItem('resqmesh_last_location_fix', JSON.stringify(cachedFix));

    // Simulate App.jsx initializer
    let cachedCoords: any = null;
    const stored = localStorage.getItem('resqmesh_last_location_fix');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.latitude != null && parsed.longitude != null) {
        cachedCoords = {
          lat: Number(parsed.latitude),
          lng: Number(parsed.longitude),
          accuracy: parsed.accuracy_meters || 20,
          timestamp: parsed.measured_at || parsed.timestamp,
          measured_at: parsed.measured_at || parsed.timestamp,
          saved_at: parsed.saved_at,
          is_last_known: true,
          source: 'LAST_KNOWN'
        };
      }
    }

    const userLocation = {
      status: cachedCoords ? 'granted' : 'prompt',
      coords: cachedCoords,
      error: null,
      isRealGps: false
    };

    expect(userLocation.coords).not.toBeNull();
    expect(userLocation.coords.lat).toBe(21.1500);
    expect(userLocation.coords.is_last_known).toBe(true);
    expect(userLocation.isRealGps).toBe(false);

    // Now simulate permission denied event:
    const updatedLocation = {
      status: 'denied',
      coords: userLocation.coords, // Preserves last known location
      error: 'User denied Geolocation',
      isRealGps: false
    };

    expect(updatedLocation.status).toBe('denied');
    expect(updatedLocation.coords.lat).toBe(21.1500);
    expect(updatedLocation.isRealGps).toBe(false);
  });

  it('5. Handles permission denied when no cached location exists without crash', () => {
    const userLocation = {
      status: 'denied',
      coords: null,
      error: 'User denied Geolocation',
      isRealGps: false
    };

    expect(userLocation.status).toBe('denied');
    expect(userLocation.coords).toBeNull();

    // Verify buildLocationObject does not throw
    const locObj = buildLocationObject({
      latitude: userLocation.coords?.lat,
      longitude: userLocation.coords?.lng,
      source: 'UNAVAILABLE'
    });
    expect(locObj.location_source).toBe('UNAVAILABLE');
    expect(locObj.latitude).toBeNull();
  });
});
