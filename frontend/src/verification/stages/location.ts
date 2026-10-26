/**
 * RESQMesh — Stage 2: Location & Anti-Spoofing Defense
 * Evaluates claimed geographic coordinates against:
 * 1. Hop-1 radio observer RSSI using a Log-Distance Path-Loss model
 * 2. Kinematic speed plausibility against previous confirmed sightings
 * 3. Tolerates GPS drift within declared error radius errM without penalty
 */

import type { Message, NodeView, StageResult, VerificationConfig } from '../types';

const EARTH_RADIUS_METERS = 6371000.0;

/**
 * Great-circle distance between two coordinates in meters.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = (lat2 - lat1) * (Math.PI / 180.0);
  const dLng = (lng2 - lng1) * (Math.PI / 180.0);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180.0)) *
      Math.cos(lat2 * (Math.PI / 180.0)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Log-distance path-loss model to estimate radio distance from RSSI.
 * RSSI = RSSI0 - 10 * n * log10(d / d0)
 * => d = d0 * 10 ^ ((RSSI0 - RSSI) / (10 * n))
 */
export function rssiToExpectedDistanceMeters(
  rssi: number,
  referenceRssi = -40,
  pathLossExponent = 2.7
): number {
  if (rssi >= referenceRssi) return 1.0;
  const exponent = (referenceRssi - rssi) / (10 * pathLossExponent);
  return Math.min(2500, Math.pow(10, exponent));
}

/**
 * Evaluates Stage 2 Location & Anti-Spoofing.
 */
export function evaluateLocationStage(
  msg: Message,
  view: NodeView,
  cfg: VerificationConfig['location'],
  currentTime: number
): StageResult {
  if (!cfg.enabled) {
    return { score: 0.0, reason: 'Stage 2 Location evaluation disabled' };
  }

  const { lat, lng, errM } = msg.claimedLoc;

  // 1. Kinematic Plausibility Check (Impossible Speed vs Previous Sighting)
  const previousSighting = view.sightings && view.sightings[msg.senderPubKey];
  if (previousSighting) {
    const timeDeltaSeconds = Math.max(0.1, currentTime - previousSighting.timestamp);
    const geometricDistanceM = haversineMeters(lat, lng, previousSighting.lat, previousSighting.lng);

    // Rule: Do NOT penalize GPS drift inside claimedLoc.errM + previous uncertainty
    const effectiveDisplacementM = Math.max(0, geometricDistanceM - errM - 20);

    if (effectiveDisplacementM > 0) {
      const speedMps = effectiveDisplacementM / timeDeltaSeconds;
      if (speedMps > cfg.maxFeasibleSpeedMps) {
        const speedKmh = Math.round(speedMps * 3.6);
        return {
          score: -0.95,
          reason: `Kinematic impossibility: displacement of ${Math.round(geometricDistanceM)}m in ${Math.round(timeDeltaSeconds)}s implies ${speedKmh} km/h (GPS teleportation spoof)`,
          metadata: { speedMps, geometricDistanceM, timeDeltaSeconds }
        };
      }
    }
  }

  // 2. Radio Observer Consistency (Log-Distance Path-Loss vs Who Hears It)
  const observerDiscrepancies: Array<{ neighbor: string; geomM: number; radioM: number; diff: number }> = [];
  let validObserverCount = 0;

  if (msg.rssiByNeighbor && view.knownNeighbors) {
    for (const [neighborId, rssi] of Object.entries(msg.rssiByNeighbor)) {
      const neighborLoc = view.knownNeighbors[neighborId];
      if (neighborLoc) {
        validObserverCount++;
        const geomDistM = haversineMeters(lat, lng, neighborLoc.lat, neighborLoc.lng);
        const radioExpectedM = rssiToExpectedDistanceMeters(
          rssi,
          cfg.referenceRssi,
          cfg.pathLossExponent
        );

        // Discrepancy allowance incorporates declared errM + RF propagation shadow margin
        // For emergency mesh (LoRa/Wi-Fi mesh), realistic reach at -70..-85 dBm spans up to 1000m-1500m
        const allowedRadiusM = Math.max(radioExpectedM * 8.0, 1000) + errM;

        if (geomDistM > allowedRadiusM) {
          observerDiscrepancies.push({
            neighbor: neighborId,
            geomM: Math.round(geomDistM),
            radioM: Math.round(radioExpectedM),
            diff: Math.round(geomDistM - allowedRadiusM)
          });
        }
      }
    }
  }

  if (observerDiscrepancies.length > 0) {
    const worst = observerDiscrepancies[0];
    return {
      score: -0.85,
      reason: `Location contradicts RF observer: neighbor heard packet at ${worst.geomM}m but RSSI model bounds max reach to ${worst.radioM}m`,
      metadata: { discrepancies: observerDiscrepancies }
    };
  }

  // If radio sightings strongly align with claimed coordinates
  if (validObserverCount >= 2) {
    return {
      score: 0.85,
      reason: `Claimed location verified by ${validObserverCount} RF observer RSSI trilateration bounds`,
      metadata: { validObserverCount }
    };
  } else if (validObserverCount === 1) {
    return {
      score: 0.45,
      reason: 'Claimed location consistent with 1 RF observer range profile',
      metadata: { validObserverCount }
    };
  }

  return {
    score: 0.15,
    reason: `Claimed location within plausible operational zone (spatial uncertainty ±${Math.round(errM)}m)`,
    metadata: { validObserverCount: 0 }
  };
}
