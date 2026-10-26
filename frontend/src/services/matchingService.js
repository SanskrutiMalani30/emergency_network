/**
 * RESQMesh — Client-Side Opportunity-Cost Matching Engine
 *
 * Runs 100% offline in the browser to match emergencies with available responders
 * based on distance, required capabilities, urgency, availability, and specialist preservation.
 */

import { matchRespondersForEmergency } from './api';

const CAPABILITY_MAP = {
  watercraft_rescue: ['boat', 'watercraft', 'rescue boat', 'swimmer', 'flood', 'watercraft_rescue'],
  trauma_paramedic: ['paramedic', 'first aid', 'trauma', 'doctor', 'medical', 'cpr', 'first_aid', 'trauma_triage'],
  refrigerated_insulin_supply: ['insulin', 'medical', 'cold storage', 'refrigerated_insulin_supply'],
  portable_oxygen: ['oxygen', 'breathing', 'cylinder', 'portable_oxygen'],
  amateur_radio: ['radio', 'ham', 'comms', 'amateur_radio_hf', 'mesh_operator'],
  general_rescue: ['rescue', 'volunteer', 'search_rescue', 'cert_disaster_coordinator']
};

export function haversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 2.5; // fallback estimate
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function normalizeCapability(cap) {
  const clean = (cap || '').toLowerCase().replace(/[\s_-]+/g, '_');
  for (const [canonical, syns] of Object.entries(CAPABILITY_MAP)) {
    if (syns.some(s => clean.includes(s))) {
      return canonical;
    }
  }
  return clean;
}

export function matchRespondersLocally(emergency, responders = []) {
  if (!emergency || responders.length === 0) {
    return {
      emergency_id: emergency?.id || emergency?.emergency_id,
      ranked_candidates: [],
      required_capabilities: emergency?.help_needed || emergency?.required_capabilities || []
    };
  }

  const emgLat = emergency.location?.latitude ?? emergency.lat ?? 21.1458;
  const emgLng = emergency.location?.longitude ?? emergency.lng ?? 79.0882;
  const rawHelp = emergency.help_needed || emergency.required_capabilities || [];
  const reqCaps = rawHelp.map(normalizeCapability);
  const isCritical = emergency.urgency === 'CRITICAL' || emergency.severity === 'CRITICAL' || emergency.urgency >= 8;

  const candidates = responders.map(resp => {
    const rLat = resp.current_lat || 21.1458;
    const rLng = resp.current_lng || 79.0882;
    const distKm = Math.round(haversineKm(rLat, rLng, emgLat, emgLng) * 10) / 10;

    // Estimated travel time (average 20 km/h in urban flood / disaster terrain + 3 min staging)
    const travelMins = Math.max(3, Math.round((distKm / 20) * 60 + 3));

    // Capabilities
    const respCaps = (resp.capabilities || resp.skills || []).map(normalizeCapability);
    const matchedCaps = reqCaps.filter(c => respCaps.includes(c));
    const hasCapability = matchedCaps.length > 0 || reqCaps.length === 0;

    // Base score (0 - 100)
    let score = 75;

    // Distance penalty
    score -= Math.min(30, distKm * 4);

    // Capability match
    if (matchedCaps.length >= reqCaps.length && reqCaps.length > 0) {
      score += 20;
    } else if (hasCapability) {
      score += 10;
    } else {
      score -= 35;
    }

    // Availability
    const isAvailable = resp.status === 'AVAILABLE';
    if (!isAvailable) {
      score -= 40;
    }

    // Battery health
    const battery = resp.battery_pct ?? 100;
    if (battery < 25) {
      score -= 20;
    }

    // Specialist preservation (Opportunity cost)
    // If responder has trauma doctor skill but emergency is low urgency supplies, penalize slightly to preserve doctor
    const isDoctor = respCaps.includes('trauma_paramedic') && (resp.name?.includes('Dr.') || resp.role?.includes('Physician'));
    if (isDoctor && !isCritical) {
      score -= 25; // preserve for critical
    }

    // Trust score bonus
    const trust = resp.trust_score ?? 0.8;
    score += (trust - 0.5) * 15;

    const finalScore = Math.min(100, Math.max(10, Math.round(score)));

    // Generate clear justification
    let justification = '';
    if (!isAvailable) {
      justification = `Currently ${resp.status}; cannot be immediately dispatched.`;
    } else if (isDoctor && !isCritical) {
      justification = `Preserved specialist: Trauma physician held in reserve for critical life-threat incidents.`;
    } else if (!hasCapability && reqCaps.length > 0) {
      justification = `Lacks requested specialized qualifications (${rawHelp.join(', ')}).`;
    } else {
      justification = `Directly equipped with ${matchedCaps.length > 0 ? matchedCaps.join(', ') : 'rescue skills'}; closest available node (${distKm} km, ETA ~${travelMins}m).`;
    }

    return {
      responder_id: resp.responder_id,
      name: resp.name || resp.display_name,
      role: resp.role || 'Volunteer Responder',
      score: finalScore,
      distance_km: distKm,
      estimated_minutes: travelMins,
      is_safe_route: distKm < 3.0,
      is_suitable: isAvailable && hasCapability && finalScore >= 50,
      justification,
      battery_pct: battery,
      status: resp.status
    };
  });

  // Sort highest score first
  candidates.sort((a, b) => b.score - a.score);

  return {
    emergency_id: emergency.id || emergency.emergency_id,
    ranked_candidates: candidates,
    required_capabilities: rawHelp
  };
}

/**
 * High-level matcher: tries server API, seamlessly falls back to local engine.
 */
export async function getMatchForEmergency(emergency, responders = []) {
  if (!emergency) return null;

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const serverRes = await matchRespondersForEmergency(emergency.id || emergency.emergency_id);
      if (serverRes && serverRes.ranked_candidates) {
        return serverRes;
      }
    } catch (e) {
      // Fall through to local matching
    }
  }

  // Local fallback
  return matchRespondersLocally(emergency, responders);
}
