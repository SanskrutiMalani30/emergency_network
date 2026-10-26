/**
 * RESQMesh — Claim Verification Module
 * Strict, framework-independent types for probabilistic decentralized claim verification.
 */

export type ClaimType = 'distress' | 'capability' | 'hazard';

export type DecisionType = 'accept' | 'challenge' | 'reject';

export interface LocationClaim {
  lat: number;
  lng: number;
  errM: number;
}

export interface Credential {
  holderPubKey: string;
  skill: string;
  issuerId: string;
  expiresAt: number; // Unix timestamp in seconds
  issuerSignature: string;
}

export interface Message {
  id: string;
  senderPubKey: string;
  type: ClaimType;
  text: string;
  claimedLoc: LocationClaim;
  timestamp: number; // Unix timestamp in seconds
  hopCount: number;
  hopPath: string[]; // sequence of peer pubkeys/nodeIds forwarding the packet
  rssiByNeighbor: Record<string, number>; // neighborId -> RSSI in dBm (e.g. -65, -85)
  signature: string;
  credential?: Credential;
  nonceResponse?: string; // response to live cryptographic challenge
  batteryPct?: number;
}

export interface HazardEntry {
  id: string;
  lat: number;
  lng: number;
  radiusM: number;
  type: string;
  confidence: number; // 0..1
  timestamp: number; // Unix timestamp in seconds
}

export interface Sighting {
  lat: number;
  lng: number;
  timestamp: number; // Unix timestamp in seconds
  sourceNeighborId?: string;
}

export interface TokenBucket {
  tokens: number;
  lastRefillTime: number; // Unix timestamp in seconds
}

export interface NodeView {
  nodeId: string;
  knownNeighbors: Record<string, { lat: number; lng: number }>;
  sightings: Record<string, Sighting>; // pubKey -> last confirmed sighting
  trustHistory: Record<string, number>; // pubKey -> trust score (0..1)
  directContacts: string[]; // pubKeys of peers we have had direct physical/radio handshake with
  hazardMap: HazardEntry[];
  issuerPubKeys: Record<string, string>; // issuerId -> issuer ed25519 pubKey hex
  rateLimiterState: Record<string, TokenBucket>; // peerId -> token bucket
  recentMessages?: Message[]; // history for copy-paste decoy detection
  activeChallenges?: Record<string, { nonce: string; targetPubKey: string; expiresAt: number }>;
}

export interface StageResult {
  score: number; // [-1.0, 1.0]: positive supports validity, negative indicates attack/fabrication
  reason: string;
  hardReject?: boolean; // if true, pipeline halts immediately (e.g. Stage 0 gate failure)
  metadata?: Record<string, any>;
}

export interface FusionWeights {
  w_identity: number;
  w_location: number;
  w_content: number;
  w_corroboration: number;
  w_credential: number;
  w_attackSignals: number;
  bias_distress: number;
  bias_capability: number;
  bias_hazard: number;
}

export interface VerificationConfig {
  weights: FusionWeights;
  thresholds: {
    reject: number;    // default 0.4
    accept: number;    // default 0.7
  };
  gate: {
    enabled: boolean;
    ttlSeconds: number; // default 3600 (1 hour)
    maxFutureDriftSeconds: number; // default 60
    rateLimitCapacity: number; // default 10 tokens
    rateLimitRefillRate: number; // tokens per second, default 0.2 (1 every 5s)
  };
  identity: {
    enabled: boolean;
    rssiSimilarityThreshold: number; // default 0.85
    directContactBonus: number; // default 0.25
  };
  location: {
    enabled: boolean;
    pathLossExponent: number; // n = 2.7 (urban / rubble)
    referenceRssi: number; // RSSI0 at 1 meter, default -40 dBm
    maxFeasibleSpeedMps: number; // default 50 m/s (180 km/h)
  };
  content: {
    enabled: boolean;
    hazardDecayHalfLifeSeconds: number; // default 7200 (2 hours)
  };
  corroboration: {
    enabled: boolean;
    diminishingBase: number; // default 0.5
    vicinityRadiusM: number; // default 800
    timeWindowSeconds: number; // default 1800 (30 mins)
  };
  credential: {
    enabled: boolean;
  };
  challenge: {
    enabled: boolean;
  };
}

export interface VerificationResult {
  probability: number; // P(claim is real) in [0, 1]
  uncertainty: number; // standard error / credible interval width in [0, 1]
  decision: DecisionType;
  reasons: string[]; // top 3 plain language reasons
  stageResults: Record<string, StageResult>;
  posterior: number; // internal logit or calibrated probability
  challengeIssued?: {
    nonce: string;
    targetPubKey: string;
    expiresAt: number;
    prompt: string;
  };
}
