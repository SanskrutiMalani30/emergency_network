/**
 * RESQMesh — Synthetic Scenario & Attack Generators
 * Generates realistic disaster mesh network topologies, honest claims,
 * and adversarial attack vectors for evaluation and stress testing.
 */

import { PRNG } from './prng';
import {
  signMessage,
  signCredential,
  createKeypairFromSeed,
  bytesToHex
} from '../crypto';
import type {
  Message,
  Credential,
  NodeView,
  HazardEntry,
  Sighting
} from '../types';

export interface ScenarioResult {
  view: NodeView;
  keys: {
    local: { publicKeyHex: string; secretKeyHex: string };
    ndrfIssuer: { publicKeyHex: string; secretKeyHex: string };
    redCrossIssuer: { publicKeyHex: string; secretKeyHex: string };
    victim: { publicKeyHex: string; secretKeyHex: string };
    responder: { publicKeyHex: string; secretKeyHex: string };
    hazardReporter: { publicKeyHex: string; secretKeyHex: string };
  };
  sampleClaims: {
    realDistress: Message;
    realCapability: Message;
    realHazard: Message;
  };
}

/**
 * Creates a fully populated disaster-response scenario with a local node,
 * surrounding mesh neighbors, hazard zones, and authentic signed claims.
 */
export function generateScenario(
  seed: number | string = 42,
  opts: {
    centerLat?: number;
    centerLng?: number;
    baseTime?: number;
  } = {}
): ScenarioResult {
  const prng = new PRNG(seed);
  const baseLat = opts.centerLat ?? 18.5204;
  const baseLng = opts.centerLng ?? 73.8567;
  const now = opts.baseTime ?? Math.floor(Date.now() / 1000);

  // Deterministic Keypairs
  const localKeys = createKeypairFromSeed(`local_node_${seed}`);
  const ndrfKeys = createKeypairFromSeed(`issuer_ndrf_${seed}`);
  const redCrossKeys = createKeypairFromSeed(`issuer_redcross_${seed}`);
  const victimKeys = createKeypairFromSeed(`victim_${seed}`);
  const responderKeys = createKeypairFromSeed(`responder_${seed}`);
  const reporterKeys = createKeypairFromSeed(`reporter_${seed}`);

  // 4 Known Mesh Neighbors within 200m - 900m
  const knownNeighbors: Record<string, { lat: number; lng: number }> = {
    'peer_alpha': {
      lat: baseLat + prng.nextFloat(0.001, 0.004),
      lng: baseLng + prng.nextFloat(0.001, 0.004)
    },
    'peer_bravo': {
      lat: baseLat - prng.nextFloat(0.001, 0.004),
      lng: baseLng + prng.nextFloat(0.001, 0.004)
    },
    'peer_charlie': {
      lat: baseLat + prng.nextFloat(0.001, 0.004),
      lng: baseLng - prng.nextFloat(0.001, 0.004)
    },
    'peer_delta': {
      lat: baseLat - prng.nextFloat(0.001, 0.004),
      lng: baseLng - prng.nextFloat(0.001, 0.004)
    }
  };

  // Past confirmed sightings
  const sightings: Record<string, Sighting> = {
    [victimKeys.publicKeyHex]: {
      lat: baseLat + 0.0015,
      lng: baseLng + 0.0018,
      timestamp: now - 180,
      sourceNeighborId: 'peer_alpha'
    },
    [responderKeys.publicKeyHex]: {
      lat: baseLat - 0.002,
      lng: baseLng + 0.001,
      timestamp: now - 300,
      sourceNeighborId: 'peer_bravo'
    }
  };

  // Active Hazard Map
  const hazardMap: HazardEntry[] = [
    {
      id: 'hazard_river_burst_01',
      lat: baseLat + 0.005,
      lng: baseLng + 0.005,
      radiusM: 600,
      type: 'flash_flood',
      confidence: 0.95,
      timestamp: now - 900
    },
    {
      id: 'hazard_bridge_collapse_02',
      lat: baseLat - 0.004,
      lng: baseLng + 0.002,
      radiusM: 300,
      type: 'road_blocked',
      confidence: 0.85,
      timestamp: now - 1800
    }
  ];

  const view: NodeView = {
    nodeId: 'node_local_coordinator',
    knownNeighbors,
    sightings,
    trustHistory: {
      [victimKeys.publicKeyHex]: 0.75,
      [responderKeys.publicKeyHex]: 0.9,
      [reporterKeys.publicKeyHex]: 0.7
    },
    directContacts: [victimKeys.publicKeyHex, responderKeys.publicKeyHex],
    hazardMap,
    issuerPubKeys: {
      'ndrf_disaster_auth': ndrfKeys.publicKeyHex,
      'red_cross_intl': redCrossKeys.publicKeyHex
    },
    rateLimiterState: {},
    recentMessages: []
  };

  // 1. Genuine Distress Claim
  const distressLoc = {
    lat: baseLat + 0.0016,
    lng: baseLng + 0.0019,
    errM: 15
  };
  const rawDistress: Omit<Message, 'signature'> = {
    id: `msg_distress_${prng.nextInt(1000, 9999)}`,
    senderPubKey: victimKeys.publicKeyHex,
    type: 'distress',
    text: 'Water entered 1st floor apartment. 3 family members including elderly grandmother trapped on terrace. Need boat evacuation.',
    claimedLoc: distressLoc,
    timestamp: now - 12,
    hopCount: 1,
    hopPath: ['peer_alpha'],
    rssiByNeighbor: {
      'peer_alpha': -68,
      'peer_bravo': -84
    },
    batteryPct: 42
  };
  const realDistress: Message = {
    ...rawDistress,
    signature: signMessage(rawDistress, victimKeys.secretKeyHex)
  };

  // 2. Genuine Capability Claim with NDRF Credential
  const rawCred: Omit<Credential, 'issuerSignature'> = {
    holderPubKey: responderKeys.publicKeyHex,
    skill: 'swift_water_rescue_lead',
    issuerId: 'ndrf_disaster_auth',
    expiresAt: now + 86400 * 30
  };
  const validCred: Credential = {
    ...rawCred,
    issuerSignature: signCredential(rawCred, ndrfKeys.secretKeyHex)
  };

  const rawCapability: Omit<Message, 'signature'> = {
    id: `msg_cap_${prng.nextInt(1000, 9999)}`,
    senderPubKey: responderKeys.publicKeyHex,
    type: 'capability',
    text: 'NDRF Certified Swift Water Rescue Team Alpha-4. Inflatable motorized zodiac boat with capacity for 6 evacuees + AED equipment.',
    claimedLoc: {
      lat: baseLat - 0.0022,
      lng: baseLng + 0.0012,
      errM: 10
    },
    timestamp: now - 25,
    hopCount: 1,
    hopPath: ['peer_bravo'],
    rssiByNeighbor: {
      'peer_bravo': -62,
      'peer_delta': -79
    },
    credential: validCred
  };
  const realCapability: Message = {
    ...rawCapability,
    signature: signMessage(rawCapability, responderKeys.secretKeyHex)
  };

  // 3. Genuine Hazard Claim
  const rawHazard: Omit<Message, 'signature'> = {
    id: `msg_haz_${prng.nextInt(1000, 9999)}`,
    senderPubKey: reporterKeys.publicKeyHex,
    type: 'hazard',
    text: 'Heavy culvert overflow on Main Canal Road. Water depth 1.2m with strong debris flow. Road impassable for light vehicles.',
    claimedLoc: {
      lat: baseLat + 0.0048,
      lng: baseLng + 0.0049,
      errM: 25
    },
    timestamp: now - 40,
    hopCount: 2,
    hopPath: ['peer_alpha', 'peer_charlie'],
    rssiByNeighbor: {
      'peer_alpha': -78,
      'peer_charlie': -72
    }
  };
  const realHazard: Message = {
    ...rawHazard,
    signature: signMessage(rawHazard, reporterKeys.secretKeyHex)
  };

  return {
    view,
    keys: {
      local: localKeys,
      ndrfIssuer: ndrfKeys,
      redCrossIssuer: redCrossKeys,
      victim: victimKeys,
      responder: responderKeys,
      hazardReporter: reporterKeys
    },
    sampleClaims: {
      realDistress,
      realCapability,
      realHazard
    }
  };
}

/**
 * ATTACK 1: Sybil Swarm
 * Generates `count` messages (default 40) using 40 distinct Ed25519 keypairs,
 * but all originating from the exact same physical radio / neighbor footprint.
 */
export function generateSybilSwarm(
  seed: number | string = 101,
  count: number = 40,
  baseTime?: number
): { messages: Message[]; commonRadioFingerprint: Record<string, number> } {
  const prng = new PRNG(seed);
  const now = baseTime ?? Math.floor(Date.now() / 1000);
  const baseLat = 18.5204;
  const baseLng = 73.8567;

  // Single physical radio's true RSSI footprint
  const baseRssi: Record<string, number> = {
    'peer_alpha': -71,
    'peer_bravo': -83,
    'peer_charlie': -90
  };

  const messages: Message[] = [];
  for (let i = 0; i < count; i++) {
    const key = createKeypairFromSeed(`sybil_${seed}_${i}`);
    // Minor radio hardware fluctuation (±0.8 dBm)
    const rssiByNeighbor: Record<string, number> = {};
    for (const [nbr, val] of Object.entries(baseRssi)) {
      rssiByNeighbor[nbr] = Math.round(val + prng.nextFloat(-0.8, 0.8));
    }

    const raw: Omit<Message, 'signature'> = {
      id: `sybil_claim_${i}`,
      senderPubKey: key.publicKeyHex,
      type: 'distress',
      text: `Distress report vote #${i}: urgent priority rescue required at sector 7`,
      claimedLoc: {
        lat: baseLat + 0.0015,
        lng: baseLng + 0.0018,
        errM: 10
      },
      // Burst within 1-2 seconds
      timestamp: now - prng.nextInt(0, 3),
      hopCount: 1,
      hopPath: ['peer_alpha'],
      rssiByNeighbor
    };

    messages.push({
      ...raw,
      signature: signMessage(raw, key.secretKeyHex)
    });
  }

  return { messages, commonRadioFingerprint: baseRssi };
}

/**
 * ATTACK 2: Copy-Paste Decoy
 * Multiple distinct keys broadcasting word-for-word copy-pasted distress text
 * at conflicting distant geographic locations.
 */
export function generateCopyPasteDecoy(
  seed: number | string = 202,
  baseTime?: number
): { messages: Message[]; copiedText: string } {
  const prng = new PRNG(seed);
  const now = baseTime ?? Math.floor(Date.now() / 1000);
  const copiedText =
    'URGENT CRITICAL HELP: School building roof collapse with 15 children trapped, water level at 2 meters, send divers ASAP!';

  const messages: Message[] = [];
  const coords = [
    { lat: 18.5204, lng: 73.8567 },
    { lat: 18.5620, lng: 73.8910 }, // ~6 km away
    { lat: 18.4810, lng: 73.8200 }, // ~6 km away
    { lat: 18.5350, lng: 73.9350 }  // ~8 km away
  ];

  for (let i = 0; i < coords.length; i++) {
    const key = createKeypairFromSeed(`decoy_${seed}_${i}`);
    const raw: Omit<Message, 'signature'> = {
      id: `decoy_claim_${i}`,
      senderPubKey: key.publicKeyHex,
      type: 'distress',
      text: copiedText,
      claimedLoc: {
        lat: coords[i].lat,
        lng: coords[i].lng,
        errM: 20
      },
      timestamp: now - (coords.length - i) * 60,
      hopCount: 1,
      hopPath: [`peer_${i}`],
      rssiByNeighbor: {
        [`peer_${i}`]: -65
      }
    };

    messages.push({
      ...raw,
      signature: signMessage(raw, key.secretKeyHex)
    });
  }

  return { messages, copiedText };
}

/**
 * ATTACK 3: GPS Spoofing
 * Sender claims coordinates physically impossible given 1-hop neighbor RSSI
 * or claims a location requiring super-sonic movement speed since last sighting.
 */
export function generateGpsSpoof(
  seed: number | string = 303,
  baseTime?: number
): { message: Message; attackerKeys: { publicKeyHex: string; secretKeyHex: string } } {
  const now = baseTime ?? Math.floor(Date.now() / 1000);
  const attacker = createKeypairFromSeed(`gps_spoofer_${seed}`);

  // Attacker is physically within 50m of peer_alpha (RSSI = -54 dBm)
  // But claims coordinates 16 km away!
  const raw: Omit<Message, 'signature'> = {
    id: `spoof_claim_${seed}`,
    senderPubKey: attacker.publicKeyHex,
    type: 'distress',
    text: 'Trapped on island in middle of river, flood current surging fast!',
    claimedLoc: {
      lat: 18.6650, // 16 km away
      lng: 73.9850,
      errM: 10
    },
    timestamp: now - 10,
    hopCount: 1,
    hopPath: ['peer_alpha'],
    rssiByNeighbor: {
      'peer_alpha': -54 // Extremely strong signal! Cannot be 16 km away!
    }
  };

  return {
    message: {
      ...raw,
      signature: signMessage(raw, attacker.secretKeyHex)
    },
    attackerKeys: attacker
  };
}

/**
 * ATTACK 4: Forged Credential
 * Attacker attempts to claim authorized medic or NDRF responder credentials
 * using an invalid/unknown signature or fake issuer key.
 */
export function generateForgedCredential(
  seed: number | string = 404,
  baseTime?: number
): { message: Message; attackerKeys: { publicKeyHex: string; secretKeyHex: string } } {
  const now = baseTime ?? Math.floor(Date.now() / 1000);
  const attacker = createKeypairFromSeed(`forger_${seed}`);
  const bogusIssuer = createKeypairFromSeed(`bogus_issuer_${seed}`);

  const rawCred: Omit<Credential, 'issuerSignature'> = {
    holderPubKey: attacker.publicKeyHex,
    skill: 'authorized_incident_commander',
    issuerId: 'ndrf_disaster_auth', // claims to be official NDRF
    expiresAt: now + 86400 * 30
  };

  // Signed by bogus rogue key rather than genuine recognized NDRF authority
  const forgedCred: Credential = {
    ...rawCred,
    issuerSignature: signCredential(rawCred, bogusIssuer.secretKeyHex)
  };

  const raw: Omit<Message, 'signature'> = {
    id: `forged_cred_msg_${seed}`,
    senderPubKey: attacker.publicKeyHex,
    type: 'capability',
    text: 'Authorized Incident Commander taking charge of sector communications. Clear radio channels.',
    claimedLoc: { lat: 18.5204, lng: 73.8567, errM: 10 },
    timestamp: now - 15,
    hopCount: 1,
    hopPath: ['peer_alpha'],
    rssiByNeighbor: { 'peer_alpha': -68 },
    credential: forgedCred
  };

  return {
    message: {
      ...raw,
      signature: signMessage(raw, attacker.secretKeyHex)
    },
    attackerKeys: attacker
  };
}

/**
 * ATTACK 5: Stolen Credential
 * Attacker intercepts or replays a validly issued credential belonging to Key A,
 * but attaches it to a claim sent by Key B (holder key mismatch or fails live challenge).
 */
export function generateStolenCredential(
  seed: number | string = 505,
  baseTime?: number
): {
  message: Message;
  legitimateHolderKeys: { publicKeyHex: string; secretKeyHex: string };
  thiefKeys: { publicKeyHex: string; secretKeyHex: string };
} {
  const now = baseTime ?? Math.floor(Date.now() / 1000);
  const scenario = generateScenario(seed, { baseTime: now });
  const legitimateHolder = scenario.keys.responder;
  const thief = createKeypairFromSeed(`thief_${seed}`);

  // Genuine credential issued to legitimate responder
  const genuineCred = scenario.sampleClaims.realCapability.credential!;

  // Thief attaches legitimate credential to their own message
  const raw: Omit<Message, 'signature'> = {
    id: `stolen_cred_msg_${seed}`,
    senderPubKey: thief.publicKeyHex, // MISMATCH with credential.holderPubKey!
    type: 'capability',
    text: 'I have doctor credentials and access to medical supply cache. Requesting fuel shipment.',
    claimedLoc: { lat: 18.5204, lng: 73.8567, errM: 10 },
    timestamp: now - 5,
    hopCount: 1,
    hopPath: ['peer_bravo'],
    rssiByNeighbor: { 'peer_bravo': -70 },
    credential: genuineCred
  };

  return {
    message: {
      ...raw,
      signature: signMessage(raw, thief.secretKeyHex)
    },
    legitimateHolderKeys: legitimateHolder,
    thiefKeys: thief
  };
}

/**
 * ATTACK 6: Flood Spam (Battery-drain DoS)
 * Sends a burst of messages from the same sender in fractions of a second
 * to deplete responder battery and mesh bandwidth.
 */
export function generateFloodSpam(
  seed: number | string = 606,
  burstCount: number = 25,
  baseTime?: number
): { messages: Message[]; spammerKeys: { publicKeyHex: string; secretKeyHex: string } } {
  const now = baseTime ?? Math.floor(Date.now() / 1000);
  const spammer = createKeypairFromSeed(`spammer_${seed}`);
  const messages: Message[] = [];

  for (let i = 0; i < burstCount; i++) {
    const raw: Omit<Message, 'signature'> = {
      id: `flood_${seed}_${i}`,
      senderPubKey: spammer.publicKeyHex,
      type: 'hazard',
      text: `SPAM FLOOD PACKET #${i} - PING PING PING`,
      claimedLoc: { lat: 18.5204, lng: 73.8567, errM: 50 },
      // All within the exact same second
      timestamp: now,
      hopCount: 1,
      hopPath: ['peer_alpha'],
      rssiByNeighbor: { 'peer_alpha': -65 }
    };

    messages.push({
      ...raw,
      signature: signMessage(raw, spammer.secretKeyHex)
    });
  }

  return { messages, spammerKeys: spammer };
}
