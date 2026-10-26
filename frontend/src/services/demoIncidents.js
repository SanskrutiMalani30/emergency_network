/**
 * RESQMesh — Seeded Demo Emergencies Service
 *
 * Provides realistic, clearly labeled fictional emergency incidents for demonstration,
 * testing, and air-gapped drill scenarios when no live user SOS has been submitted.
 *
 * Requirements:
 * 1. Every seeded incident is visibly marked with `is_demo: true` and labeled `DEMO` in UI & API.
 * 2. Locations are relative to a configurable demo center (VITE_DEMO_CENTER_LAT / VITE_DEMO_CENTER_LNG).
 * 3. Seeded records are kept strictly separate from real user emergencies.
 * 4. Easily toggled ON / OFF at runtime.
 */

// Configurable center for disaster drill scenario (Default: Nagpur Command Sector)
export const DEFAULT_DEMO_CENTER = {
  lat: typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_CENTER_LAT
    ? parseFloat(import.meta.env.VITE_DEMO_CENTER_LAT)
    : 21.1458,
  lng: typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_CENTER_LNG
    ? parseFloat(import.meta.env.VITE_DEMO_CENTER_LNG)
    : 79.0882
};

const DEMO_STORAGE_KEY = 'resqmesh_demo_mode_enabled';
const ACTIVE_CENTER_KEY = 'resqmesh_active_demo_center';
let inMemoryDemoEnabled = true;

/**
 * Calculates latitude and longitude coordinates for a target distance (km) and bearing (degrees)
 * relative to a center point.
 */
export function calculateOffsetCoords(centerLat, centerLng, distKm, bearingDeg) {
  const rad = (bearingDeg * Math.PI) / 180;
  const latDelta = (distKm / 111.32) * Math.cos(rad);
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  const lngDelta = (distKm / (111.32 * (Math.abs(cosLat) > 0.01 ? cosLat : 1.0))) * Math.sin(rad);
  return {
    lat: Number((centerLat + latDelta).toFixed(5)),
    lng: Number((centerLng + lngDelta).toFixed(5))
  };
}

export function getActiveDemoCenter() {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(ACTIVE_CENTER_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && isFinite(parsed.lat) && isFinite(parsed.lng)) return parsed;
      } catch (e) {}
    }
  }
  return DEFAULT_DEMO_CENTER;
}

export function setActiveDemoCenter(center) {
  if (center && isFinite(center.lat) && isFinite(center.lng)) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_CENTER_KEY, JSON.stringify({
        lat: Number(center.lat),
        lng: Number(center.lng)
      }));
    }
  }
}

export function isDemoModeEnabled() {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(DEMO_STORAGE_KEY);
    if (stored !== null) {
      return stored === 'true';
    }
  }
  return inMemoryDemoEnabled;
}

export function setDemoModeEnabled(enabled) {
  inMemoryDemoEnabled = !!enabled;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DEMO_STORAGE_KEY, enabled ? 'true' : 'false');
  }
}

/**
 * Filters a list of incidents, preserving or excluding demo incidents.
 */
export function filterDemoIncidents(incidents = [], includeDemo = true) {
  if (!Array.isArray(incidents)) return [];
  if (includeDemo) return incidents;
  return incidents.filter(e => !e.is_demo);
}

/**
 * Returns the set of realistic seed demo incidents dynamically anchored in the range of
 * 5.0 to 7.0 km from the specified user/scenario center.
 */
export function getSeedDemoIncidents(center = getActiveDemoCenter()) {
  const baseLat = Number(center.lat);
  const baseLng = Number(center.lng);

  // Position disasters within 5.0 - 7.0 km radius
  const p1 = calculateOffsetCoords(baseLat, baseLng, 5.2, 35);   // ~5.2 km Northeast
  const p2 = calculateOffsetCoords(baseLat, baseLng, 5.8, 125);  // ~5.8 km Southeast
  const p3 = calculateOffsetCoords(baseLat, baseLng, 6.3, 215);  // ~6.3 km Southwest
  const p4 = calculateOffsetCoords(baseLat, baseLng, 6.8, 305);  // ~6.8 km Northwest
  const p5 = calculateOffsetCoords(baseLat, baseLng, 5.5, 175);  // ~5.5 km South

  return [
    {
      id: 'demo-emg-01-insulin',
      emergency_id: 'demo-emg-01-insulin',
      is_demo: true,
      category: 'medical',
      description: 'Diabetic elderly patient trapped on 1st floor; temperature-controlled insulin supply running dangerously low.',
      raw_message: 'Diabetic elderly patient trapped on 1st floor; temperature-controlled insulin supply running dangerously low.',
      severity: 'CRITICAL',
      urgency: 9,
      urgency_label: 'CRITICAL',
      verification_status: 'VERIFIED',
      confidence_score: 0.94,
      verification_reasons: [
        'Corroborated by 2 independent neighborhood mesh reports',
        'Hospital prescription token matched',
        'High GPS precision (±12m uncertainty radius)'
      ],
      required_capabilities: ['refrigerated_insulin_supply', 'general_first_aid_rescue'],
      help_needed: ['refrigerated_insulin_supply', 'general_first_aid_rescue'],
      lat: p1.lat,
      lng: p1.lng,
      latitude: p1.lat,
      longitude: p1.lng,
      approx_distance_km: 5.2,
      location_accuracy_meters: 12.0,
      accuracy_meters: 12.0,
      location_source: 'CURRENT',
      status: 'OPEN',
      assistance_status: 'OPEN',
      assigned_responder_id: null,
      assigned_responder_name: null,
      created_at: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
      landmark: 'Sector Northeast (~5.2 km from your location)',
      reporter_id: 'demo-citizen-sharma',
      reporter_phone: '+91 94231 DEMO1',
      ai_explanation: 'Critical diabetic emergency with access cutoff. High priority for refrigerated supply.'
    },
    {
      id: 'demo-emg-02-flood',
      emergency_id: 'demo-emg-02-flood',
      is_demo: true,
      category: 'flood',
      description: 'Ground floor completely flooded; water rising past window sills. Family of 4 stranded on terrace awaiting boat extraction.',
      raw_message: 'Ground floor completely flooded; water rising past window sills. Family of 4 stranded on terrace awaiting boat extraction.',
      severity: 'CRITICAL',
      urgency: 9,
      urgency_label: 'CRITICAL',
      verification_status: 'VERIFIED',
      confidence_score: 0.91,
      verification_reasons: [
        'Corroborated by municipal river water sensor telemetry',
        'Nearby flood pilot beacon active',
        'Visual evidence photo verified'
      ],
      required_capabilities: ['watercraft_rescue', 'portable_oxygen', 'special_mobility_assistance'],
      help_needed: ['watercraft_rescue', 'portable_oxygen', 'special_mobility_assistance'],
      lat: p2.lat,
      lng: p2.lng,
      latitude: p2.lat,
      longitude: p2.lng,
      approx_distance_km: 5.8,
      location_accuracy_meters: 15.0,
      accuracy_meters: 15.0,
      location_source: 'CURRENT',
      status: 'OPEN',
      assistance_status: 'OPEN',
      assigned_responder_id: null,
      assigned_responder_name: null,
      created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      landmark: 'Sector Southeast River Corridor (~5.8 km from your location)',
      reporter_id: 'demo-citizen-verma',
      reporter_phone: '+91 94231 DEMO2',
      ai_explanation: 'Active inundation with trapped residents. Requires watercraft or high-clearance rescue vehicle.'
    },
    {
      id: 'demo-emg-03-collapse',
      emergency_id: 'demo-emg-03-collapse',
      is_demo: true,
      category: 'rescue',
      description: 'Partial stairwell collapse after masonry failure; 2 adults conscious but blocked from exiting on 2nd floor.',
      raw_message: 'Partial stairwell collapse after masonry failure; 2 adults conscious but blocked from exiting on 2nd floor.',
      severity: 'HIGH',
      urgency: 7,
      urgency_label: 'HIGH',
      verification_status: 'PARTIALLY_VERIFIED',
      confidence_score: 0.75,
      verification_reasons: [
        'Single witness report supported by acoustic sensor peak',
        'Awaiting second peer corroboration'
      ],
      required_capabilities: ['general_first_aid_rescue', 'special_mobility_assistance'],
      help_needed: ['general_first_aid_rescue', 'special_mobility_assistance'],
      lat: p3.lat,
      lng: p3.lng,
      latitude: p3.lat,
      longitude: p3.lng,
      approx_distance_km: 6.3,
      location_accuracy_meters: 18.0,
      accuracy_meters: 18.0,
      location_source: 'CURRENT',
      status: 'OPEN',
      assistance_status: 'OPEN',
      assigned_responder_id: null,
      assigned_responder_name: null,
      created_at: new Date(Date.now() - 38 * 60 * 1000).toISOString(),
      landmark: 'Sector Southwest Commercial Complex (~6.3 km from your location)',
      reporter_id: 'demo-citizen-kulkarni',
      reporter_phone: '+91 94231 DEMO3',
      ai_explanation: 'Structural entrapment with stable victims. Heavy extraction tools and ladder needed.'
    },
    {
      id: 'demo-emg-04-supplies',
      emergency_id: 'demo-emg-04-supplies',
      is_demo: true,
      category: 'supplies',
      description: 'Community evacuation shelter running low on clean drinking water and infant formula (18 people sheltered).',
      raw_message: 'Community evacuation shelter running low on clean drinking water and infant formula (18 people sheltered).',
      severity: 'MODERATE',
      urgency: 5,
      urgency_label: 'MODERATE',
      verification_status: 'UNVERIFIED',
      confidence_score: 0.55,
      verification_reasons: [
        'Provisional self-report from shelter volunteer',
        'Uncorroborated by independent peer node'
      ],
      required_capabilities: ['emergency_rations_water'],
      help_needed: ['emergency_rations_water'],
      lat: p4.lat,
      lng: p4.lng,
      latitude: p4.lat,
      longitude: p4.lng,
      approx_distance_km: 6.8,
      location_accuracy_meters: 35.0,
      accuracy_meters: 35.0,
      location_source: 'CURRENT',
      status: 'OPEN',
      assistance_status: 'OPEN',
      assigned_responder_id: null,
      assigned_responder_name: null,
      created_at: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
      landmark: 'Sector Northwest Community Hall (~6.8 km from your location)',
      reporter_id: 'demo-shelter-volunteer',
      reporter_phone: '+91 94231 DEMO4',
      ai_explanation: 'Logistical supply depletion. Non-life-threatening but escalating without potable water.'
    },
    {
      id: 'demo-emg-05-suspicious',
      emergency_id: 'demo-emg-05-suspicious',
      is_demo: true,
      category: 'disaster',
      description: 'Testing 123 decoy alert free food for all send all units here now.',
      raw_message: 'Testing 123 decoy alert free food for all send all units here now.',
      severity: 'LOW',
      urgency: 3,
      urgency_label: 'LOW',
      verification_status: 'SUSPICIOUS',
      confidence_score: 0.20,
      verification_reasons: [
        'Flagged for suspicious test / decoy phrase',
        'Poor GPS precision (>50m uncertainty radius)'
      ],
      required_capabilities: ['general_first_aid_rescue'],
      help_needed: ['general_first_aid_rescue'],
      lat: p5.lat,
      lng: p5.lng,
      latitude: p5.lat,
      longitude: p5.lng,
      approx_distance_km: 5.5,
      location_accuracy_meters: 80.0,
      accuracy_meters: 80.0,
      location_source: 'CURRENT',
      status: 'OPEN',
      assistance_status: 'OPEN',
      assigned_responder_id: null,
      assigned_responder_name: null,
      created_at: new Date(Date.now() - 72 * 60 * 1000).toISOString(),
      landmark: 'Sector South Perimeter (~5.5 km from your location)',
      reporter_id: 'demo-unknown-node',
      reporter_phone: '+91 94231 DEMO5',
      ai_explanation: 'Likely synthetic or test signal. Flagged as suspicious; assistance not prohibited but caution advised.'
    }
  ];
}

/**
 * Re-anchors all demo disaster incidents to the specified center coordinate
 * in the range of 5.0 to 7.0 km.
 */
export function relocateDemoIncidents(center) {
  if (!center || !isFinite(center.lat) || !isFinite(center.lng)) return [];
  setActiveDemoCenter(center);
  return getSeedDemoIncidents(center);
}
