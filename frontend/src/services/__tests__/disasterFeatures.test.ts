import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveLocationFix, getLastKnownLocationFix } from '../offlineStorage';
import { formatLocationAge, getLocationFreshnessLabel, buildLocationObject } from '../locationService';
import { detectLanguage, hasSpeechSynthesisSupport, stopEmergencySpeech } from '../speechService';
import { calculateDisasterRoute, TRAVEL_MODES, ROUTING_OBJECTIVES } from '../routingService';

// Ensure localStorage is polyfilled for Node test environment
const mockStorage: Record<string, string> = {};
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage.clear) {
  (globalThis as any).localStorage = {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, val: string) => { mockStorage[key] = String(val); },
    removeItem: (key: string) => { delete mockStorage[key]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
  };
}

describe('RESQMesh Disaster Features — Offline Location, Speech & Routing Engine', () => {

  beforeEach(() => {
    if (typeof localStorage !== 'undefined' && localStorage.clear) {
      localStorage.clear();
    }
  });

  describe('1. Offline Last Known Location Persistence & Freshness', () => {
    it('persists location fix to localStorage fallback and restores accurately', async () => {
      const fix = {
        lat: 21.1458,
        lng: 79.0882,
        accuracy_meters: 12.5,
        measured_at: Date.now() - 45000,
        is_fresh: true
      };

      await saveLocationFix(fix);
      const restored = await getLastKnownLocationFix();

      expect(restored).toBeDefined();
      expect(Number(restored?.lat)).toBeCloseTo(21.1458, 4);
      expect(Number(restored?.lng)).toBeCloseTo(79.0882, 4);
      expect(restored?.accuracy_meters).toBe(13);
      expect(restored?.saved_at).toBeDefined();
    });

    it('formats dynamic location age correctly for different elapsed windows', () => {
      const now = Date.now();

      // Recent (< 30 seconds)
      const tenSecAgo = now - 10000;
      expect(formatLocationAge(tenSecAgo)).toContain('Location updated');
      expect(formatLocationAge(tenSecAgo)).toContain('seconds ago');

      // Minutes (< 60 minutes)
      const eightMinAgo = now - (8 * 60 * 1000);
      expect(formatLocationAge(eightMinAgo)).toBe('Last location traced 8 minutes ago');

      const oneMinAgo = now - (65 * 1000);
      expect(formatLocationAge(oneMinAgo)).toBe('Last location traced 1 minute ago');

      // Hours (> 60 minutes)
      const twoHoursAgo = now - (2 * 60 * 60 * 1000);
      expect(formatLocationAge(twoHoursAgo)).toBe('Last location traced 2 hours ago');

      // Null or invalid input
      expect(formatLocationAge(null)).toBe('');
    });

    it('provides standardized freshness labels without falsifying live GPS', () => {
      // 1. Live GPS
      const liveLoc = { is_fresh: true, latitude: 21.1458, longitude: 79.0882 };
      expect(getLocationFreshnessLabel(liveLoc).label).toBe('Current GPS location');

      // 2. Cached / Last Known
      const cachedLoc = { is_fresh: false, location_source: 'LAST_KNOWN', latitude: 21.1458, longitude: 79.0882 };
      expect(getLocationFreshnessLabel(cachedLoc).label).toBe('Last known location');

      // 3. Unavailable
      const nullLoc = null;
      expect(getLocationFreshnessLabel(nullLoc).label).toBe('Location unavailable');

      const emptyLoc = { latitude: null, longitude: null };
      expect(getLocationFreshnessLabel(emptyLoc).label).toBe('Location unavailable');
    });

    it('builds valid location telemetry object from raw coordinate data', () => {
      const loc = buildLocationObject({
        latitude: 21.1458,
        longitude: 79.0882,
        accuracy_meters: 15,
        source: 'CURRENT'
      });
      expect(loc.latitude).toBe(21.1458);
      expect(loc.longitude).toBe(79.0882);
      expect(loc.accuracy_meters).toBe(15);
      expect(loc.location_source).toBe('CURRENT');
      expect(loc.location_timestamp).toBeDefined();
    });
  });

  describe('2. Multilingual Speech Synthesis Detection', () => {
    it('detects Hindi (Devanagari) script and returns hi-IN', () => {
      const hindiText = 'यहाँ भारी बाढ़ आ गई है, कृपया तुरंत बचाव दल भेजें';
      expect(detectLanguage(hindiText)).toBe('hi-IN');
    });

    it('detects Hinglish disaster phrases and routes to hi-IN', () => {
      const hinglishText = 'yahan pani bhot badh gaya hai bachao urgently';
      expect(detectLanguage(hinglishText)).toBe('hi-IN');

      const hinglish2 = 'ghar me fas gaya hu flood me help chahiye';
      expect(detectLanguage(hinglish2)).toBe('hi-IN');
    });

    it('detects English descriptions and returns en-IN or en-US', () => {
      const englishText = 'Severe waterlogging near civil lines hospital. 4 civilians trapped on roof.';
      const lang = detectLanguage(englishText);
      expect(['en-IN', 'en-US']).toContain(lang);
    });

    it('handles empty or non-string text safely without crashing', () => {
      expect(['en-IN', 'en-US']).toContain(detectLanguage(''));
      expect(['en-IN', 'en-US']).toContain(detectLanguage(null as any));
      expect(['en-IN', 'en-US']).toContain(detectLanguage(undefined as any));
    });

    it('exposes safe stopSpeech function', () => {
      expect(() => stopEmergencySpeech()).not.toThrow();
    });
  });

  describe('3. Shortest Path & Disaster Response Routing Engine', () => {
    const originGps = {
      lat: 21.1458,
      lng: 79.0882,
      accuracy: 10,
      measured_at: Date.now() - 5000,
      is_last_known: false
    };

    const originCached = {
      lat: 21.1458,
      lng: 79.0882,
      accuracy: 25,
      measured_at: Date.now() - (12 * 60 * 1000),
      is_last_known: true
    };

    const destination = {
      lat: 21.1432,
      lng: 79.0965,
      id: 'emg-ward12',
      title: 'Ward 12 Clinic Flooding'
    };

    it('computes offline road network route with driving mode and shortest objective', async () => {
      const route = await calculateDisasterRoute(originGps, destination, {
        mode: TRAVEL_MODES.DRIVING,
        objective: ROUTING_OBJECTIVES.SHORTEST,
        forceOffline: true
      });

      expect(route).toBeDefined();
      expect(route.success).toBe(true);
      expect(route.engine).toBe('OFFLINE_ROAD_GRAPH');
      expect(route.travel_mode).toBe('driving');
      expect(route.objective).toBe('shortest');
      expect(route.distance_km).toBeGreaterThan(0);
      expect(route.duration_minutes).toBeGreaterThan(0);
      expect(route.eta_label).toContain('(Estimate without live traffic)');
      expect(route.polyline.length).toBeGreaterThanOrEqual(2);
      expect(route.origin_telemetry.is_cached).toBe(false);
      expect(route.origin_telemetry.age_text).toBe('Live GPS');
    });

    it('adjusts duration appropriately between walking and driving modes', async () => {
      const drivingRoute = await calculateDisasterRoute(originGps, destination, {
        mode: TRAVEL_MODES.DRIVING,
        forceOffline: true
      });

      const walkingRoute = await calculateDisasterRoute(originGps, destination, {
        mode: TRAVEL_MODES.WALKING,
        forceOffline: true
      });

      expect(walkingRoute.duration_minutes).toBeGreaterThan(drivingRoute.duration_minutes);
      expect(walkingRoute.travel_mode).toBe('walking');
    });

    it('preserves cached origin telemetry and formats last known age', async () => {
      const route = await calculateDisasterRoute(originCached, destination, {
        forceOffline: true
      });

      expect(route.origin_telemetry.is_cached).toBe(true);
      expect(route.origin_telemetry.age_text).toBe('Last location traced 12 minutes ago');
    });

    it('detects hazards along route and appends critical safety warnings', async () => {
      const activeHazards = [
        {
          hazard_id: 'haz-flood-1',
          name: 'Central Road Flash Flood',
          center_lat: 21.1445,
          center_lng: 79.0910,
          radius_km: 1.2
        }
      ];

      const route = await calculateDisasterRoute(originGps, destination, {
        hazards: activeHazards,
        forceOffline: true
      });

      expect(route.hazards_intersected.length).toBeGreaterThan(0);
      expect(route.hazard_warnings.some((w: string) => w.includes('DANGER') || w.includes('flood'))).toBe(true);
      expect(route.hazard_warnings.some((w: string) => w.includes('Shortest path may contain unmapped floodwaters'))).toBe(true);
    });

    it('falls back to straight-line bearing when destination is outside topological graph', async () => {
      const farDestination = {
        lat: 19.0760,
        lng: 72.8777, // Mumbai (far outside Nagpur local road graph)
        id: 'emg-mumbai'
      };

      const route = await calculateDisasterRoute(originGps, farDestination, {
        forceOffline: true
      });

      expect(route.engine).toBe('DIRECT_BEARING_FALLBACK');
      expect(route.polyline.length).toBe(2);
      expect(route.hazard_warnings.some((w: string) => w.includes('outside mapped road graph'))).toBe(true);
    });

    it('rejects invalid or missing origin coordinates with a descriptive error', async () => {
      await expect(
        calculateDisasterRoute(null as any, destination)
      ).rejects.toThrow('Starting location is missing');

      await expect(
        calculateDisasterRoute({ lat: 'invalid' as any, lng: 79.08 }, destination)
      ).rejects.toThrow('Coordinates must be valid numeric');
    });
  });
});
